import { useState, useEffect } from "react";
import { useTasks } from "../hooks/useTasks";
import axiosInstance from "../api/axiosInstance";
import axios from "axios"; // Standard axios for S3 (no Bearer token)
import TaskCard from "../components/TaskCard";
import "./Dashboard.css";
import { FaPlus, FaChartBar, FaList } from "react-icons/fa";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from "recharts";

function Dashboard() {
  const { tasks, loading, fetchTasks, createTask, updateTask, deleteTask } = useTasks();
  const [filter, setFilter] = useState("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState("list"); // 'list' or 'charts'

  // ── Form State ────────────────────────────────────────────────────────────
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    status: "pending",
    priority: "medium",
    due_date: "",
    file_key: null,
  });

  const [editingId, setEditingId] = useState(null);
  const [users, setUsers] = useState([]);
  const [uploading, setUploading] = useState(false);
  const user = JSON.parse(localStorage.getItem("user"));

  useEffect(() => {
    fetchTasks();
    if (user?.role === "admin") {
      axiosInstance.get("admin/users/")
        .then(res => setUsers(res.data))
        .catch(err => console.error(err));
    }
  }, [fetchTasks, user?.role]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      // 1. Get presigned URL from Django
      const { data } = await axiosInstance.post("s3/presign-upload/", {
        filename: file.name,
        content_type: file.type || "application/octet-stream"
      });

      // 2. Upload directly to S3
      await axios.put(data.upload_url, file, {
        headers: { "Content-Type": file.type || "application/octet-stream" }
      });

      // 3. Save the key in form data
      setFormData(prev => ({ ...prev, file_key: data.key }));
      alert("File uploaded to S3 successfully!");
    } catch (err) {
      console.error("S3 Upload Error:", err);
      alert("Failed to upload file to S3.");
    } finally {
      setUploading(false);
    }
  };

  const openAddModal = () => {
    setEditingId(null);
    setFormData({ title: "", description: "", status: "pending", priority: "medium", due_date: "", file_key: null });
    setIsModalOpen(true);
  };

  const openEditModal = (task) => {
    setEditingId(task._id);
    setFormData({
      title: task.title,
      description: task.description || "",
      status: task.status,
      priority: task.priority || "medium",
      due_date: task.due_date || "",
      file_key: task.file_key || null,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title.trim()) return;

    let res;
    if (editingId) {
      res = await updateTask(editingId, formData);
    } else {
      res = await createTask(formData);
    }

    if (res.success) setIsModalOpen(false);
    else alert(res.error);
  };

  const handleDelete = (id) => {
    if (window.confirm("Are you sure you want to delete this task?")) {
      deleteTask(id);
    }
  };

  const toggleStatus = (task) => {
    const newStatus = task.status === "pending" ? "completed" : "pending";
    updateTask(task._id, { ...task, status: newStatus });
  };

  // ── Filtering & Chart Data ─────────────────────────────────────────────────
  const filteredTasks = tasks.filter((task) => {
    if (filter === "all") return true;
    return task.status === filter;
  });

  const stats = {
    total: tasks.length,
    completed: tasks.filter((t) => t.status === "completed").length,
    pending: tasks.filter((t) => t.status === "pending").length,
    inProgress: tasks.filter((t) => t.status === "in_progress").length,
    high: tasks.filter((t) => t.priority === "high" && t.status !== "completed").length,
  };

  const pieData = [
    { name: "Pending", value: stats.pending, color: "#f59e0b" },
    { name: "In Progress", value: stats.inProgress, color: "#6366f1" },
    { name: "Completed", value: stats.completed, color: "#10b981" },
  ].filter(d => d.value > 0);

  const priorityData = [
    { name: "Low", value: tasks.filter(t => t.priority === "low").length },
    { name: "Medium", value: tasks.filter(t => t.priority === "medium").length },
    { name: "High", value: tasks.filter(t => t.priority === "high").length },
  ];

  return (
    <div>
      <div className="dashboard-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div>
            <h1>{user?.role === "admin" ? "System Dashboard" : "My Dashboard"}</h1>
            <p>
              {user?.role === "admin"
                ? "Overview of all tasks and activity on the platform."
                : "Welcome back! Here's an overview of your tasks."}
            </p>
          </div>
          <div className="view-toggle" style={{ display: 'flex', gap: '10px', background: '#f1f5f9', padding: '5px', borderRadius: '10px' }}>
            <button
              onClick={() => setViewMode("list")}
              style={{ border: 'none', background: viewMode === "list" ? "#fff" : "transparent", padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: '600', color: viewMode === "list" ? "var(--primary)" : "#64748b", boxShadow: viewMode === "list" ? "0 2px 5px rgba(0,0,0,0.1)" : "none" }}
            >
              <FaList /> List
            </button>
            <button
              onClick={() => setViewMode("charts")}
              style={{ border: 'none', background: viewMode === "charts" ? "#fff" : "transparent", padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: '600', color: viewMode === "charts" ? "var(--primary)" : "#64748b", boxShadow: viewMode === "charts" ? "0 2px 5px rgba(0,0,0,0.1)" : "none" }}
            >
              <FaChartBar /> Analytics
            </button>
          </div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-value">{stats.total}</span>
          <span className="stat-label">{user?.role === "admin" ? "Platform Tasks" : "Total Tasks"}</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: "var(--success)" }}>{stats.completed}</span>
          <span className="stat-label">{user?.role === "admin" ? "Global Completed" : "Completed"}</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: "var(--warning)" }}>{stats.pending + stats.inProgress}</span>
          <span className="stat-label">{user?.role === "admin" ? "Active Global" : "Active"}</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: "#ef4444" }}>{stats.high}</span>
          <span className="stat-label">High Priority</span>
        </div>
      </div>

      {viewMode === "charts" ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '24px', marginBottom: '30px' }}>
          <div className="stat-card" style={{ padding: '24px' }}>
            <h3 style={{ marginBottom: '20px', fontSize: '1rem' }}>Status Distribution</h3>
            <div style={{ height: '250px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                    {pieData.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="stat-card" style={{ padding: '24px' }}>
            <h3 style={{ marginBottom: '20px', fontSize: '1rem' }}>Priority Distribution</h3>
            <div style={{ height: '250px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={priorityData}>
                  <XAxis dataKey="name" axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip cursor={{ fill: 'transparent' }} />
                  <Bar dataKey="value" radius={[10, 10, 0, 0]}>
                    {priorityData.map((entry, index) => (
                      <Cell key={index} fill={entry.name === "High" ? "#ef4444" : entry.name === "Medium" ? "#f59e0b" : "#10b981"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="task-controls">
            <div className="filter-group">
              <button className={`filter-btn ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>All</button>
              <button className={`filter-btn ${filter === "pending" ? "active" : ""}`} onClick={() => setFilter("pending")}>Pending</button>
              <button className={`filter-btn ${filter === "completed" ? "active" : ""}`} onClick={() => setFilter("completed")}>Completed</button>
            </div>

            {user?.role !== "admin" && (
              <button className="add-task-btn" onClick={openAddModal}>
                <FaPlus /> New Task
              </button>
            )}
          </div>

          <div className="tasks-grid">
            {loading ? (
              <p>Loading tasks...</p>
            ) : filteredTasks.length > 0 ? (
              filteredTasks.map((task) => (
                <TaskCard
                  key={task._id}
                  task={task}
                  owner={users.find(u => u.id === task.user_id)?.name}
                  toggleStatus={() => toggleStatus(task)}
                  deleteTask={() => handleDelete(task._id)}
                  editTask={() => openEditModal(task)}
                />
              ))
            ) : (
              <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
                <h3>No tasks found</h3>
                <p>Create a new task to get started!</p>
              </div>
            )}
          </div>
        </>
      )}

      {isModalOpen && (
        <div
          className="modal-overlay"
          onClick={(e) => { if (e.target.className === "modal-overlay") setIsModalOpen(false); }}
        >
          <div className="modal">
            <h2>{editingId ? "Edit Task" : "Create New Task"}</h2>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label style={{ display: "block", marginBottom: "8px", fontWeight: "500" }}>Title *</label>
                <input
                  className="form-input"
                  name="title"
                  type="text"
                  placeholder="What needs to be done?"
                  value={formData.title}
                  onChange={handleInputChange}
                  autoFocus
                  required
                />
              </div>

              <div className="form-group">
                <label style={{ display: "block", marginBottom: "8px", fontWeight: "500" }}>Description</label>
                <textarea
                  className="form-input"
                  name="description"
                  rows="3"
                  placeholder="Add details..."
                  value={formData.description}
                  onChange={handleInputChange}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div className="form-group">
                  <label style={{ display: "block", marginBottom: "8px", fontWeight: "500" }}>Priority</label>
                  <select className="form-input" name="priority" value={formData.priority} onChange={handleInputChange}>
                    <option value="low">🟢 Low</option>
                    <option value="medium">🟡 Medium</option>
                    <option value="high">🔴 High</option>
                  </select>
                </div>

                <div className="form-group">
                  <label style={{ display: "block", marginBottom: "8px", fontWeight: "500" }}>Status</label>
                  <select className="form-input" name="status" value={formData.status} onChange={handleInputChange}>
                    <option value="pending">⏳ Pending</option>
                    <option value="in_progress">🔄 In Progress</option>
                    <option value="completed">✅ Completed</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label style={{ display: "block", marginBottom: "8px", fontWeight: "500" }}>📅 Due Date</label>
                <input
                  className="form-input"
                  name="due_date"
                  type="date"
                  value={formData.due_date}
                  onChange={handleInputChange}
                  min={new Date().toISOString().split("T")[0]}
                />
              </div>

              <div className="form-group">
                <label style={{ display: "block", marginBottom: "8px", fontWeight: "500" }}>📎 Attachment (S3)</label>
                <input
                  className="form-input"
                  type="file"
                  onChange={handleFileChange}
                  disabled={uploading}
                />
                {uploading && <p style={{ fontSize: "0.8rem", color: "var(--primary)", marginTop: "5px" }}>📤 Uploading to S3...</p>}
                {formData.file_key && !uploading && (
                  <p style={{ fontSize: "0.8rem", color: "var(--success)", marginTop: "5px" }}>✅ File ready: {formData.file_key.split('/').pop()}</p>
                )}
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={uploading}>
                  {editingId ? "Save Changes" : "Create Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
