import { useState, useEffect } from "react";
import axiosInstance from "../api/axiosInstance";
import axios from "axios"; // Standard axios for S3 (no Bearer token)
import { FaUsers, FaTasks, FaTrash, FaShieldAlt, FaPaperclip } from "react-icons/fa";

function AdminDashboard() {
    const [users, setUsers] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("users"); // 'users' or 'tasks'
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [formData, setFormData] = useState({
        title: "",
        description: "",
        status: "pending",
        priority: "medium",
        due_date: "",
        file_key: null,
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [usersRes, tasksRes] = await Promise.all([
                axiosInstance.get("admin/users/"),
                axiosInstance.get("admin/tasks/")
            ]);
            setUsers(usersRes.data);
            setTasks(tasksRes.data);
        } catch (err) {
            console.error("Failed to fetch admin data", err);
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploading(true);
        try {
            const { data } = await axiosInstance.post("s3/presign-upload/", {
                filename: file.name,
                content_type: file.type || "application/octet-stream"
            });

            await axios.put(data.upload_url, file, {
                headers: { "Content-Type": file.type || "application/octet-stream" }
            });

            setFormData(prev => ({ ...prev, file_key: data.key }));
            alert("File attached successfully!");
        } catch (err) {
            console.error("S3 Upload Error:", err);
            alert("Failed to upload file to S3.");
        } finally {
            setUploading(false);
        }
    };

    const openAssignModal = (user) => {
        setSelectedUser(user);
        setFormData({ title: "", description: "", status: "pending", priority: "medium", due_date: "", file_key: null });
        setIsModalOpen(true);
    };

    const handleAssignSubmit = async (e) => {
        e.preventDefault();
        if (!formData.title.trim()) return;

        try {
            await axiosInstance.post("tasks/create/", {
                ...formData,
                user_id: selectedUser.id
            });
            setIsModalOpen(false);
            fetchData(); // Refresh tasks
            alert(`Task assigned to ${selectedUser.name}`);
        } catch (err) {
            alert(err.response?.data?.error || "Failed to assign task");
        }
    };

    const deleteUser = async (userId) => {
        if (!window.confirm("Are you sure you want to delete this user and all their tasks?")) return;
        try {
            await axiosInstance.delete(`admin/users/delete/${userId}/`);
            setUsers(users.filter(u => u.id !== userId));
            setTasks(tasks.filter(t => t.user_id !== userId));
        } catch (err) {
            alert("Failed to delete user");
        }
    };

    const deleteTask = async (taskId) => {
        if (!window.confirm("Are you sure you want to delete this task?")) return;
        try {
            await axiosInstance.delete(`admin/tasks/delete/${taskId}/`);
            setTasks(tasks.filter(t => t._id !== taskId));
        } catch (err) {
            alert("Failed to delete task");
        }
    };

    const stats = {
        totalUsers: users.length,
        totalTasks: tasks.length,
        completedTasks: tasks.filter(t => t.status === "completed").length,
        pendingTasks: tasks.filter(t => t.status === "pending" || t.status === "in_progress").length,
    };

    if (loading) return <div className="loading">Loading Admin Panel...</div>;

    return (
        <div className="dashboard-container">
            <header className="dashboard-header" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <FaShieldAlt size={32} color="var(--primary)" />
                <div>
                    <h1 className="dashboard-title">Admin Management</h1>
                    <p className="dashboard-subtitle">Control center for users and tasks across the platform.</p>
                </div>
            </header>

            <div className="stats-grid" style={{ marginBottom: '30px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                <div className="stat-card" style={{ textAlign: 'center' }}>
                    <span className="stat-value">{stats.totalUsers}</span>
                    <span className="stat-label">Total Users</span>
                </div>
                <div className="stat-card" style={{ textAlign: 'center' }}>
                    <span className="stat-value">{stats.totalTasks}</span>
                    <span className="stat-label">Total Tasks</span>
                </div>
                <div className="stat-card" style={{ textAlign: 'center' }}>
                    <span className="stat-value" style={{ color: "var(--success)" }}>{stats.completedTasks}</span>
                    <span className="stat-label">Completed</span>
                </div>
                <div className="stat-card" style={{ textAlign: 'center' }}>
                    <span className="stat-value" style={{ color: "var(--warning)" }}>{stats.pendingTasks}</span>
                    <span className="stat-label">Pending/Active</span>
                </div>
            </div>

            <div className="admin-tabs" style={{ display: 'flex', gap: '20px', marginBottom: '30px', borderBottom: '1px solid #eee' }}>
                <button
                    onClick={() => setActiveTab("users")}
                    className={`tab-btn ${activeTab === "users" ? "active" : ""}`}
                    style={{
                        padding: '10px 20px',
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                        fontWeight: '600',
                        color: activeTab === "users" ? "var(--primary)" : "#666",
                        borderBottom: activeTab === "users" ? "2px solid var(--primary)" : "None"
                    }}
                >
                    <FaUsers style={{ marginRight: '8px' }} /> Users ({users.length})
                </button>
                <button
                    onClick={() => setActiveTab("tasks")}
                    className={`tab-btn ${activeTab === "tasks" ? "active" : ""}`}
                    style={{
                        padding: '10px 20px',
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                        fontWeight: '600',
                        color: activeTab === "tasks" ? "var(--primary)" : "#666",
                        borderBottom: activeTab === "tasks" ? "2px solid var(--primary)" : "None"
                    }}
                >
                    <FaTasks style={{ marginRight: '8px' }} /> All Tasks ({tasks.length})
                </button>
            </div>

            {activeTab === "users" ? (
                <div className="stats-grid" style={{ gridTemplateColumns: '1fr' }}>
                    <div className="stat-card" style={{ padding: '0' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead style={{ background: '#f8f9fa', borderBottom: '1px solid #eee' }}>
                                <tr>
                                    <th style={{ textAlign: 'left', padding: '15px' }}>Name</th>
                                    <th style={{ textAlign: 'left', padding: '15px' }}>Email</th>
                                    <th style={{ textAlign: 'left', padding: '15px' }}>Tasks (Done/Total)</th>
                                    <th style={{ textAlign: 'left', padding: '15px' }}>Role</th>
                                    <th style={{ textAlign: 'left', padding: '15px' }}>Joined</th>
                                    <th style={{ textAlign: 'center', padding: '15px' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map(u => (
                                    <tr key={u.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                        <td style={{ padding: '15px' }}>{u.name}</td>
                                        <td style={{ padding: '15px' }}>{u.email}</td>
                                        <td style={{ padding: '15px' }}>
                                            <span style={{ fontWeight: '600' }}>
                                                {tasks.filter(t => t.user_id === u.id && t.status === 'completed').length} / {tasks.filter(t => t.user_id === u.id).length}
                                            </span>
                                        </td>
                                        <td style={{ padding: '15px' }}>
                                            <span style={{
                                                padding: '4px 8px',
                                                borderRadius: '4px',
                                                fontSize: '0.8rem',
                                                background: u.role === 'admin' ? '#e1f5fe' : '#f5f5f5',
                                                color: u.role === 'admin' ? '#0288d1' : '#616161'
                                            }}>
                                                {u.role.toUpperCase()}
                                            </span>
                                        </td>
                                        <td style={{ padding: '15px' }}>{new Date(u.created_at).toLocaleDateString()}</td>
                                        <td style={{ padding: '15px', textAlign: 'center', display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' }}>
                                            <button
                                                onClick={() => openAssignModal(u)}
                                                title="Assign a task to this user"
                                                style={{ border: 'none', background: '#e8f5e9', color: '#2e7d32', cursor: 'pointer', padding: '5px 10px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: '600' }}
                                            >
                                                + Assign Task
                                            </button>
                                            {u.role !== 'admin' && (
                                                <button
                                                    onClick={() => deleteUser(u.id)}
                                                    style={{ border: 'none', background: 'none', color: '#ff4d4f', cursor: 'pointer' }}
                                                >
                                                    <FaTrash />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="stats-grid" style={{ gridTemplateColumns: '1fr' }}>
                    <div className="stat-card" style={{ padding: '0' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead style={{ background: '#f8f9fa', borderBottom: '1px solid #eee' }}>
                                <tr>
                                    <th style={{ textAlign: 'left', padding: '15px' }}>Title</th>
                                    <th style={{ textAlign: 'left', padding: '15px' }}>Assigned To</th>
                                    <th style={{ textAlign: 'left', padding: '15px' }}>Status</th>
                                    <th style={{ textAlign: 'left', padding: '15px' }}>Priority</th>
                                    <th style={{ textAlign: 'center', padding: '15px' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tasks.map(t => (
                                    <tr key={t._id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                        <td style={{ padding: '15px' }}>{t.title}</td>
                                        <td style={{ padding: '15px', fontSize: '0.85rem' }}>{users.find(u => u.id === t.user_id)?.name || t.user_id}</td>
                                        <td style={{ padding: '15px' }}>
                                            <span className={`status-badge ${t.status}`}>
                                                {t.status.replace("_", " ")}
                                            </span>
                                        </td>
                                        <td style={{ padding: '15px' }}>
                                            <span className={`priority-badge ${t.priority}`}>
                                                {t.priority}
                                            </span>
                                        </td>
                                        <td style={{ padding: '15px', textAlign: 'center' }}>
                                            <button
                                                onClick={() => deleteTask(t._id)}
                                                style={{ border: 'none', background: 'none', color: '#ff4d4f', cursor: 'pointer' }}
                                            >
                                                <FaTrash />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {isModalOpen && (
                <div
                    className="modal-overlay"
                    onClick={(e) => { if (e.target.className === 'modal-overlay') setIsModalOpen(false); }}
                >
                    <div className="modal">
                        <h2>Assign Task to <span style={{ color: 'var(--primary)' }}>{selectedUser?.name}</span></h2>
                        <form onSubmit={handleAssignSubmit}>
                            <div className="form-group" style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>Title *</label>
                                <input className="form-input" name="title" type="text" placeholder="Task title" value={formData.title} onChange={handleInputChange} autoFocus required />
                            </div>
                            <div className="form-group" style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>Description</label>
                                <textarea className="form-input" name="description" rows="3" placeholder="Details..." value={formData.description} onChange={handleInputChange} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>Priority</label>
                                    <select className="form-input" name="priority" value={formData.priority} onChange={handleInputChange}>
                                        <option value="low">🟢 Low</option>
                                        <option value="medium">🟡 Medium</option>
                                        <option value="high">🔴 High</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>Status</label>
                                    <select className="form-input" name="status" value={formData.status} onChange={handleInputChange}>
                                        <option value="pending">⏳ Pending</option>
                                        <option value="in_progress">🔄 In Progress</option>
                                        <option value="completed">✅ Completed</option>
                                    </select>
                                </div>
                            </div>
                            <div className="form-group" style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>📅 Due Date</label>
                                <input className="form-input" name="due_date" type="date" value={formData.due_date} onChange={handleInputChange} min={new Date().toISOString().split('T')[0]} />
                            </div>
                            <div className="form-group" style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>📎 Attachment (S3)</label>
                                <input className="form-input" type="file" onChange={handleFileChange} disabled={uploading} />
                                {uploading && <p style={{ fontSize: "0.8rem", color: "var(--primary)", marginTop: "5px" }}>📤 Uploading...</p>}
                                {formData.file_key && !uploading && (
                                    <p style={{ fontSize: "0.8rem", color: "var(--success)", marginTop: "5px" }}>✅ Ready: {formData.file_key.split('/').pop()}</p>
                                )}
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
                                <button type="submit" className="btn-primary" disabled={uploading}>Assign Task</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export default AdminDashboard;
