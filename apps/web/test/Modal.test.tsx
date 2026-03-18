import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { Modal } from "../src/components/ui/index.js";

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

describe("Modal", () => {
  it("renders nothing when isOpen is false", () => {
    render(
      <Modal isOpen={false} onClose={() => {}} title="Test">
        Content
      </Modal>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders a dialog when isOpen is true", async () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Test">
        Content
      </Modal>,
    );
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeDefined();
    });
  });

  it("renders the title text", async () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Confirm Action">
        Body
      </Modal>,
    );
    await waitFor(() => {
      expect(screen.getByText("Confirm Action")).toBeDefined();
    });
  });

  it("renders children in the body", async () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Test">
        <p data-testid="modal-content">Hello World</p>
      </Modal>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("modal-content")).toHaveTextContent("Hello World");
    });
  });

  it("renders footer when provided", async () => {
    render(
      <Modal
        isOpen={true}
        onClose={() => {}}
        title="Test"
        footer={<button type="button">Save</button>}
      >
        Body
      </Modal>,
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save" })).toBeDefined();
    });
  });

  it("does not render footer section when footer is not provided", async () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Test">
        Body
      </Modal>,
    );
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeDefined();
    });
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("calls onClose when the close button is clicked", async () => {
    const handleClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={handleClose} title="Test">
        Body
      </Modal>,
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Close" })).toBeDefined();
    });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(handleClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when Escape key is pressed", async () => {
    const handleClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={handleClose} title="Test">
        Body
      </Modal>,
    );
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeDefined();
    });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(handleClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when backdrop is clicked", async () => {
    const handleClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={handleClose} title="Test">
        Body
      </Modal>,
    );
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeDefined();
    });
    const dialog = screen.getByRole("dialog");
    const backdrop = dialog.parentElement!;
    fireEvent.click(backdrop);
    expect(handleClose).toHaveBeenCalledOnce();
  });

  it("does not call onClose when the panel content is clicked", async () => {
    const handleClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={handleClose} title="Test">
        Body text
      </Modal>,
    );
    await waitFor(() => {
      expect(screen.getByText("Body text")).toBeDefined();
    });
    fireEvent.click(screen.getByText("Body text"));
    expect(handleClose).not.toHaveBeenCalled();
  });
});
