import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  useGetRepertoiresQuery,
  useCreateRepertoireMutation,
  useDeleteRepertoireMutation,
  useUpdateRepertoireMutation,
} from "../store/apiSlice.js";
import type { RepertoireListItem } from "@chess/shared";
import { Button } from "../components/ui/Button.js";
import { Badge } from "../components/ui/Badge.js";
import { Modal } from "../components/ui/Modal.js";
import { Input } from "../components/ui/Input.js";
import { useToast } from "../components/ui/ToastProvider.js";
import { PageSkeleton } from "../components/ui/Skeleton.js";
import styles from "./RepertoireListPage.module.css";

function formatRelativeTime(unixSeconds: number): string {
  const now = Date.now();
  const diffMs = now - unixSeconds * 1000;
  const diffSeconds = Math.floor(diffMs / 1000);

  if (diffSeconds < 60) return "just now";

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}mo ago`;

  const diffYears = Math.floor(diffDays / 365);
  return `${diffYears}y ago`;
}

export function RepertoireListPage() {
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RepertoireListItem | null>(null);
  const [editTarget, setEditTarget] = useState<RepertoireListItem | null>(null);
  const [kebabOpenId, setKebabOpenId] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<"white" | "black">("white");
  const [newDescription, setNewDescription] = useState("");
  const [editName, setEditName] = useState("");

  const { data: repertoires, isLoading, isError } = useGetRepertoiresQuery();
  const [createRepertoire, { isLoading: isCreating }] = useCreateRepertoireMutation();
  const [deleteRepertoire, { isLoading: isDeleting }] = useDeleteRepertoireMutation();
  const [updateRepertoire, { isLoading: isUpdating }] = useUpdateRepertoireMutation();
  const navigate = useNavigate();
  const { showToast } = useToast();

  useEffect(() => {
    if (!createModalOpen) {
      setNewName("");
      setNewColor("white");
      setNewDescription("");
    }
  }, [createModalOpen]);

  useEffect(() => {
    if (kebabOpenId === null) return;
    function handleClickOutside() {
      setKebabOpenId(null);
    }
    document.addEventListener("click", handleClickOutside);
    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, [kebabOpenId]);

  async function handleCreate() {
    if (!newName.trim()) return;
    try {
      const result = await createRepertoire({
        name: newName.trim(),
        color: newColor,
        description: newDescription.trim() || undefined,
      }).unwrap();
      setCreateModalOpen(false);
      navigate(`/repertoires/${result.id}`);
      showToast("Repertoire created", "success");
    } catch {
      showToast("Failed to create repertoire", "error");
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteRepertoire(deleteTarget.id).unwrap();
      setDeleteTarget(null);
      showToast("Repertoire deleted", "success");
    } catch {
      showToast("Failed to delete repertoire", "error");
    }
  }

  async function handleEditSave() {
    if (!editTarget || !editName.trim()) return;
    try {
      await updateRepertoire({ id: editTarget.id, body: { name: editName.trim() } }).unwrap();
      setEditTarget(null);
      showToast("Repertoire updated", "success");
    } catch {
      showToast("Failed to update repertoire", "error");
    }
  }

  if (isLoading) {
    return (
      <div className={styles.page}>
        <PageSkeleton testId="repertoire-loading" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className={styles.page}>
        <p className={styles.errorText}>Failed to load repertoires.</p>
      </div>
    );
  }

  const items = repertoires ?? [];

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Repertoires</h1>
        <Button onClick={() => setCreateModalOpen(true)}>New Repertoire</Button>
      </div>

      {items.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyText}>
            No repertoires yet. Create your first opening repertoire!
          </p>
          <Button onClick={() => setCreateModalOpen(true)}>Create Repertoire</Button>
        </div>
      ) : (
        <div className={styles.grid}>
          {items.map((item) => (
            <div
              key={item.id}
              className={styles.repertoireCard}
              onClick={() => navigate(`/repertoires/${item.id}`)}
              data-testid={`repertoire-card-${item.id}`}
            >
              <div className={styles.cardHeader}>
                <span className={styles.cardName}>{item.name}</span>
                <button
                  type="button"
                  className={styles.kebabButton}
                  onClick={(e) => {
                    e.stopPropagation();
                    setKebabOpenId(kebabOpenId === item.id ? null : item.id);
                  }}
                  aria-label="Repertoire actions"
                >
                  ⋮
                </button>
              </div>
              <div className={styles.cardMeta}>
                <Badge variant={item.color === "white" ? "neutral" : "info"} size="sm">
                  {item.color === "white" ? "White" : "Black"}
                </Badge>
                <span>{item.moveCount} moves</span>
                <span>{formatRelativeTime(item.updatedAt)}</span>
              </div>
              {item.description && (
                <span className={styles.cardDescription}>
                  {item.description.length > 100
                    ? item.description.slice(0, 100) + "…"
                    : item.description}
                </span>
              )}

              {kebabOpenId === item.id && (
                <div className={styles.kebabMenu}>
                  <button
                    type="button"
                    className={styles.kebabMenuItem}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditTarget(item);
                      setEditName(item.name);
                      setKebabOpenId(null);
                    }}
                  >
                    Edit name
                  </button>
                  <button
                    type="button"
                    className={`${styles.kebabMenuItem} ${styles.kebabMenuItemDanger}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(item);
                      setKebabOpenId(null);
                    }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="New Repertoire"
        footer={
          <div className={styles.modalFooter}>
            <Button variant="secondary" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              loading={isCreating}
              disabled={!newName.trim() || isCreating}
            >
              Create
            </Button>
          </div>
        }
      >
        <div className={styles.modalForm}>
          <Input
            label="Name"
            name="repertoire-name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g., Sicilian Najdorf"
            required
          />
          <div>
            <label className={styles.colorLabel}>Color</label>
            <div className={styles.colorSelector}>
              <button
                type="button"
                className={`${styles.colorOption} ${newColor === "white" ? styles.colorOptionSelected : ""}`}
                onClick={() => setNewColor("white")}
              >
                ♔ White
              </button>
              <button
                type="button"
                className={`${styles.colorOption} ${newColor === "black" ? styles.colorOptionSelected : ""}`}
                onClick={() => setNewColor("black")}
              >
                ♚ Black
              </button>
            </div>
          </div>
          <Input
            label="Description (optional)"
            name="repertoire-description"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="Brief description of this repertoire"
          />
        </div>
      </Modal>

      <Modal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete Repertoire"
        footer={
          <div className={styles.modalFooter}>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={isDeleting}>
              Delete
            </Button>
          </div>
        }
      >
        <p>
          Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This action cannot
          be undone.
        </p>
      </Modal>

      <Modal
        isOpen={editTarget !== null}
        onClose={() => setEditTarget(null)}
        title="Edit Repertoire"
        footer={
          <div className={styles.modalFooter}>
            <Button variant="secondary" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleEditSave}
              loading={isUpdating}
              disabled={!editName.trim() || isUpdating}
            >
              Save
            </Button>
          </div>
        }
      >
        <div className={styles.modalForm}>
          <Input
            label="Name"
            name="edit-repertoire-name"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Repertoire name"
            required
          />
        </div>
      </Modal>
    </div>
  );
}
