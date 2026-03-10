import { FaCheck, FaUndo, FaPencilAlt, FaTrash, FaCalendarAlt, FaExclamationCircle, FaPaperclip, FaDownload } from "react-icons/fa";
import axios from "../api/axiosInstance";

/**
 * TaskCard Component
 * Displays a single task with title, description, status badge,
 * priority badge, due date, and action buttons.
 */
function TaskCard({ task, toggleStatus, deleteTask, editTask, owner }) {

  // ── Due-date helpers ────────────────────────────────────────────────────
  const getDueDateInfo = () => {
    if (!task.due_date) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = new Date(task.due_date);
    const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));

    // Format: "Feb 20, 2026"
    const formatted = dueDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    let color = "var(--text-muted)";
    let label = `Due ${formatted}`;
    let urgent = false;

    if (task.status !== "completed") {
      if (diffDays < 0) {
        color = "#ef4444";   // red — overdue
        label = `Overdue · ${formatted}`;
        urgent = true;
      } else if (diffDays === 0) {
        color = "#f97316";   // orange — due today
        label = `Due Today · ${formatted}`;
        urgent = true;
      } else if (diffDays <= 2) {
        color = "#eab308";   // yellow — due soon
        label = `Due Soon · ${formatted}`;
      }
    }

    return { label, color, urgent };
  };

  const dueDateInfo = getDueDateInfo();

  // ── Priority badge colour ───────────────────────────────────────────────
  const priorityColor = {
    high: "#ef4444",
    medium: "#eab308",
    low: "#22c55e",
  }[task.priority] || "var(--text-muted)";

  const priorityEmoji = {
    high: "🔴",
    medium: "🟡",
    low: "🟢",
  }[task.priority] || "";

  // ── S3 Download Handler ──────────────────────────────────────────────────
  const handleDownload = async () => {
    if (!task.file_key) return;
    try {
      const { data } = await axios.get(`s3/presign-download/?key=${encodeURIComponent(task.file_key)}`);
      window.open(data.download_url, "_blank");
    } catch (err) {
      alert("Failed to get download URL");
    }
  };

  return (
    <div className={`task-card ${task.status}`}>
      {/* ── Card Header ── */}
      <div className="card-header">
        <h4 className="task-title">{task.title}</h4>
        <span className={`task-badge ${task.status === "completed" ? "badge-completed" : "badge-pending"}`}>
          {task.status === "completed" ? "✅ Completed" : task.status === "in_progress" ? "🔄 In Progress" : "⏳ Pending"}
        </span>
      </div>

      {/* ── Description ── */}
      <p className="task-desc">
        {task.description || "No description provided."}
      </p>

      {/* Attachment Link — NEW */}
      {task.file_key && (
        <div style={{ marginBottom: "12px" }}>
          <button
            onClick={handleDownload}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: "#f1f5f9",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              padding: "6px 12px",
              fontSize: "0.8rem",
              fontWeight: "600",
              color: "#475569",
              cursor: "pointer",
              transition: "all 0.2s"
            }}
            onMouseEnter={e => e.currentTarget.style.background = "#e2e8f0"}
            onMouseLeave={e => e.currentTarget.style.background = "#f1f5f9"}
          >
            <FaPaperclip /> {task.file_key.split('/').pop()} <FaDownload style={{ marginLeft: "4px", fontSize: "0.7rem" }} />
          </button>
        </div>
      )}

      {/* ── Meta row: priority + due date ── */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "12px" }}>
        {/* Priority badge */}
        {task.priority && (
          <span style={{
            fontSize: "0.72rem",
            fontWeight: "600",
            color: priorityColor,
            background: `${priorityColor}18`,
            borderRadius: "999px",
            padding: "2px 10px",
            border: `1px solid ${priorityColor}40`,
            letterSpacing: "0.03em",
          }}>
            {priorityEmoji} {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)} Priority
          </span>
        )}

        {/* Due date badge — NEW */}
        {dueDateInfo && (
          <span style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            fontSize: "0.72rem",
            fontWeight: "600",
            color: dueDateInfo.color,
            background: `${dueDateInfo.color}15`,
            borderRadius: "999px",
            padding: "2px 10px",
            border: `1px solid ${dueDateInfo.color}35`,
          }}>
            {dueDateInfo.urgent
              ? <FaExclamationCircle style={{ fontSize: "0.65rem" }} />
              : <FaCalendarAlt style={{ fontSize: "0.65rem" }} />
            }
            {dueDateInfo.label}
          </span>
        )}
      </div>

      {owner && (
        <div style={{ fontSize: "0.75rem", fontWeight: "700", color: "#6366f1", marginBottom: "8px" }}>
          👤 {owner}
        </div>
      )}

      {/* ── Created date (small) ── */}
      {task.created_at && (
        <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: "10px" }}>
          Created: {new Date(task.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </p>
      )}

      {/* ── Action Buttons ── */}
      <div className="card-actions">
        <button
          className="icon-btn"
          onClick={toggleStatus}
          title={task.status === "pending" ? "Mark as Completed" : "Mark as Pending"}
        >
          {task.status === "completed" ? <FaUndo /> : <FaCheck />}
        </button>

        <button className="icon-btn" onClick={editTask} title="Edit Task">
          <FaPencilAlt />
        </button>

        <button className="icon-btn delete" onClick={deleteTask} title="Delete Task">
          <FaTrash />
        </button>
      </div>
    </div>
  );
}

export default TaskCard;
