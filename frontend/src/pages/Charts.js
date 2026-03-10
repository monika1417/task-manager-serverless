import { useEffect, useState, useCallback } from "react";
import {
  PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line, ResponsiveContainer
} from "recharts";
import axiosInstance from "../api/axiosInstance";

// ── Colour palettes ────────────────────────────────────────────────────────────
const STATUS_COLORS = ["#f59e0b", "#6366f1", "#10b981"];
const PRIORITY_COLORS = ["#10b981", "#f59e0b", "#ef4444"];
const OVERDUE_COLORS = ["#34d399", "#fbbf24", "#f87171"];

// ── Tiny helpers ───────────────────────────────────────────────────────────────
const today = () => new Date().toISOString().split("T")[0];
const sevenDaysAgo = () => {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().split("T")[0];
};

function ChartCard({ title, children, fullWidth = false, badge = null }) {
  return (
    <div style={{
      background: "#fff",
      borderRadius: "16px",
      padding: "24px",
      boxShadow: "0 4px 24px rgba(99,102,241,0.08)",
      border: "1px solid #e2e8f0",
      gridColumn: fullWidth ? "1 / -1" : undefined,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
        <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "#0f172a" }}>{title}</h3>
        {badge != null && (
          <span style={{
            background: badge > 0 ? "#fef2f2" : "#f0fdf4",
            color: badge > 0 ? "#ef4444" : "#10b981",
            padding: "4px 12px",
            borderRadius: "20px",
            fontSize: "0.8rem",
            fontWeight: 700,
          }}>
            {badge > 0 ? `⚠️ ${badge} overdue` : "✅ None overdue"}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function StatPill({ label, value, color }) {
  return (
    <div style={{
      background: "#f8fafc",
      border: "1px solid #e2e8f0",
      borderRadius: "12px",
      padding: "16px 20px",
      display: "flex",
      flexDirection: "column",
      gap: 4,
    }}>
      <span style={{ fontSize: "2rem", fontWeight: 800, color }}>{value}</span>
      <span style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</span>
    </div>
  );
}

// ── Export to CSV ──────────────────────────────────────────────────────────────
function exportCSV(tasks) {
  if (!tasks.length) { alert("No tasks to export with current filters."); return; }
  const headers = ["Title", "Status", "Priority", "Due Date", "Created At"];
  const rows = tasks.map(t => [
    `"${(t.title || "").replace(/"/g, '""')}"`,
    t.status,
    t.priority,
    t.due_date || "",
    t.created_at ? t.created_at.split("T")[0] : "",
  ]);
  const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tasks_export_${today()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main Component ─────────────────────────────────────────────────────────────
function Charts() {
  // chart data
  const [statusData, setStatusData] = useState([]);
  const [priorityData, setPriorityData] = useState([]);
  const [dateData, setDateData] = useState([]);
  const [overdueData, setOverdueData] = useState([]);
  const [overdueTotal, setOverdueTotal] = useState(0);

  // filter state
  const [filters, setFilters] = useState({
    date_from: sevenDaysAgo(),
    date_to: today(),
    priority: "",
    status: "",
  });
  const [filteredTasks, setFilteredTasks] = useState([]);

  const [loading, setLoading] = useState(true);
  const [filterLoading, setFilterLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  // ── Fetch overview charts ────────────────────────────────────────────────────
  const fetchCharts = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, priorityRes, dateRes, overdueRes] = await Promise.all([
        axiosInstance.get("analytics/status/"),
        axiosInstance.get("analytics/priority/"),
        axiosInstance.get("analytics/date/"),
        axiosInstance.get("analytics/overdue/"),
      ]);

      setStatusData([
        { name: "Pending", value: statusRes.data.pending },
        { name: "In Progress", value: statusRes.data.in_progress },
        { name: "Completed", value: statusRes.data.completed },
      ]);
      setPriorityData([
        { name: "Low", value: priorityRes.data.low },
        { name: "Medium", value: priorityRes.data.medium },
        { name: "High", value: priorityRes.data.high },
      ]);
      setDateData(dateRes.data);
      setOverdueData(overdueRes.data.data);
      setOverdueTotal(overdueRes.data.total);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error("Error fetching analytics", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Fetch filtered task list ─────────────────────────────────────────────────
  const fetchFiltered = useCallback(async (f) => {
    setFilterLoading(true);
    try {
      const params = new URLSearchParams();
      if (f.date_from) params.append("date_from", f.date_from);
      if (f.date_to) params.append("date_to", f.date_to);
      if (f.priority) params.append("priority", f.priority);
      if (f.status) params.append("status", f.status);
      const res = await axiosInstance.get(`analytics/filtered/?${params.toString()}`);
      setFilteredTasks(res.data);
    } catch (err) {
      console.error("Filtered fetch error", err);
    } finally {
      setFilterLoading(false);
    }
  }, []);

  useEffect(() => { fetchCharts(); }, [fetchCharts]);
  useEffect(() => { fetchFiltered(filters); }, [fetchFiltered, filters]);

  const handleFilter = (key, val) => setFilters(prev => ({ ...prev, [key]: val }));
  const resetFilters = () => setFilters({ date_from: sevenDaysAgo(), date_to: today(), priority: "", status: "" });

  const handleRefresh = () => {
    fetchCharts();
    fetchFiltered(filters);
  };

  // ── Summary stats from filtered tasks ───────────────────────────────────────
  const summaryStats = {
    total: filteredTasks.length,
    completed: filteredTasks.filter(t => t.status === "completed").length,
    pending: filteredTasks.filter(t => t.status === "pending").length,
    high: filteredTasks.filter(t => t.priority === "high").length,
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", flexDirection: "column", gap: 16 }}>
      <div style={{ width: 48, height: 48, border: "4px solid #e2e8f0", borderTop: "4px solid #6366f1", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <p style={{ color: "#64748b", fontWeight: 600 }}>Loading Analytics...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.6rem", fontWeight: 800, color: "#0f172a" }}>📊 Analytics Dashboard</h1>
          {lastRefreshed && (
            <p style={{ margin: "4px 0 0", color: "#94a3b8", fontSize: "0.8rem" }}>
              Last refreshed: {lastRefreshed.toLocaleTimeString()}
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={handleRefresh}
            style={{
              background: "#6366f1", color: "#fff", border: "none",
              padding: "10px 20px", borderRadius: 10, fontWeight: 700,
              cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
              boxShadow: "0 4px 12px rgba(99,102,241,0.3)",
              transition: "all 0.2s",
            }}
            onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
            onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
          >
            🔄 Refresh
          </button>
          <button
            onClick={() => exportCSV(filteredTasks)}
            style={{
              background: "#10b981", color: "#fff", border: "none",
              padding: "10px 20px", borderRadius: 10, fontWeight: 700,
              cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
              boxShadow: "0 4px 12px rgba(16,185,129,0.3)",
              transition: "all 0.2s",
            }}
            onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
            onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
          >
            ⬇️ Export CSV
          </button>
        </div>
      </div>

      {/* ── Filter Panel ── */}
      <div style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 16,
        padding: "20px 24px",
        marginBottom: 28,
        boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "#0f172a" }}>🔍 Filter Tasks</h3>
          <button
            onClick={resetFilters}
            style={{ background: "#f1f5f9", border: "none", color: "#64748b", padding: "6px 14px", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: "0.85rem" }}
          >
            Reset
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
          <div>
            <label style={labelStyle}>📅 From Date</label>
            <input type="date" value={filters.date_from} max={filters.date_to}
              onChange={e => handleFilter("date_from", e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>📅 To Date</label>
            <input type="date" value={filters.date_to} min={filters.date_from}
              onChange={e => handleFilter("date_to", e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>🎯 Priority</label>
            <select value={filters.priority} onChange={e => handleFilter("priority", e.target.value)} style={inputStyle}>
              <option value="">All Priorities</option>
              <option value="low">🟢 Low</option>
              <option value="medium">🟡 Medium</option>
              <option value="high">🔴 High</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>📌 Status</label>
            <select value={filters.status} onChange={e => handleFilter("status", e.target.value)} style={inputStyle}>
              <option value="">All Statuses</option>
              <option value="pending">⏳ Pending</option>
              <option value="in_progress">🔄 In Progress</option>
              <option value="completed">✅ Completed</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Summary Pills (from filtered data) ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14, marginBottom: 28 }}>
        <StatPill label="Filtered Total" value={filterLoading ? "…" : summaryStats.total} color="#6366f1" />
        <StatPill label="Completed" value={filterLoading ? "…" : summaryStats.completed} color="#10b981" />
        <StatPill label="Pending" value={filterLoading ? "…" : summaryStats.pending} color="#f59e0b" />
        <StatPill label="High Priority" value={filterLoading ? "…" : summaryStats.high} color="#ef4444" />
        <StatPill label="Overdue (Total)" value={overdueTotal} color={overdueTotal > 0 ? "#ef4444" : "#10b981"} />
      </div>

      {/* ── Charts Grid ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 24, marginBottom: 28 }}>

        {/* 1. Status Pie */}
        <ChartCard title="Status Distribution">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={statusData} cx="50%" cy="50%" outerRadius={90} innerRadius={50} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                {statusData.map((_, i) => <Cell key={i} fill={STATUS_COLORS[i % STATUS_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => [`${v} tasks`]} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 2. Priority Bar */}
        <ChartCard title="Priority Distribution">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={priorityData} barCategoryGap="35%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 13 }} />
              <YAxis tick={{ fill: "#64748b", fontSize: 13 }} allowDecimals={false} />
              <Tooltip formatter={(v) => [`${v} tasks`]} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {priorityData.map((_, i) => <Cell key={i} fill={PRIORITY_COLORS[i]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 3. Overdue by Priority Bar */}
        <ChartCard title="Overdue Tasks by Priority" badge={overdueTotal}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={overdueData} barCategoryGap="35%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 13 }} />
              <YAxis tick={{ fill: "#64748b", fontSize: 13 }} allowDecimals={false} />
              <Tooltip formatter={(v) => [`${v} tasks`, "Overdue"]} />
              <Bar dataKey="overdue" radius={[6, 6, 0, 0]}>
                {overdueData.map((_, i) => <Cell key={i} fill={OVERDUE_COLORS[i]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {overdueTotal === 0 && (
            <p style={{ textAlign: "center", color: "#10b981", fontWeight: 600, marginTop: 8 }}>🎉 All caught up! No overdue tasks.</p>
          )}
        </ChartCard>

        {/* 4. Creation Trend Line */}
        <ChartCard title="Tasks Created (Last 7 Days)">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={dateData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 12 }} />
              <YAxis tick={{ fill: "#64748b", fontSize: 13 }} allowDecimals={false} />
              <Tooltip formatter={(v) => [`${v} tasks`]} />
              <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={3} dot={{ r: 6, fill: "#6366f1", strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 8 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

      </div>

      {/* ── Filtered Task Table ── */}
      <div style={{
        background: "#fff",
        borderRadius: 16,
        padding: 24,
        boxShadow: "0 4px 24px rgba(99,102,241,0.08)",
        border: "1px solid #e2e8f0",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "#0f172a" }}>
            📋 Filtered Tasks
            <span style={{ marginLeft: 10, background: "#ede9fe", color: "#6366f1", padding: "3px 10px", borderRadius: 20, fontSize: "0.8rem", fontWeight: 700 }}>
              {filterLoading ? "…" : filteredTasks.length}
            </span>
          </h3>
          <button
            onClick={() => exportCSV(filteredTasks)}
            style={{ background: "#f0fdf4", color: "#10b981", border: "1px solid #bbf7d0", padding: "7px 16px", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: "0.85rem" }}
          >
            ⬇️ Export CSV
          </button>
        </div>

        {filterLoading ? (
          <p style={{ textAlign: "center", color: "#94a3b8", padding: 24 }}>Loading...</p>
        ) : filteredTasks.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8" }}>
            <p style={{ fontSize: "2rem", margin: 0 }}>🔍</p>
            <p style={{ fontWeight: 600 }}>No tasks match your filters.</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["Title", "Status", "Priority", "Due Date", "Created"].map(h => (
                    <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: "#64748b", fontWeight: 700, fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map((t, i) => {
                  const isOverdue = t.due_date && new Date(t.due_date) < new Date() && t.status !== "completed";
                  return (
                    <tr key={t._id} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa", transition: "background 0.15s" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#f0f9ff"}
                      onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "#fff" : "#fafafa"}
                    >
                      <td style={{ padding: "12px 16px", color: "#0f172a", fontWeight: 600, borderBottom: "1px solid #f1f5f9", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.title}
                      </td>
                      <td style={{ padding: "12px 16px", borderBottom: "1px solid #f1f5f9" }}>
                        <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: "0.78rem", fontWeight: 700, ...statusStyle(t.status) }}>
                          {statusLabel(t.status)}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", borderBottom: "1px solid #f1f5f9" }}>
                        <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: "0.78rem", fontWeight: 700, ...priorityStyle(t.priority) }}>
                          {t.priority}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", borderBottom: "1px solid #f1f5f9", color: isOverdue ? "#ef4444" : "#64748b", fontWeight: isOverdue ? 700 : 400 }}>
                        {t.due_date ? `${t.due_date}${isOverdue ? " ⚠️" : ""}` : "—"}
                      </td>
                      <td style={{ padding: "12px 16px", borderBottom: "1px solid #f1f5f9", color: "#94a3b8" }}>
                        {t.created_at ? t.created_at.split("T")[0] : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Style helpers ──────────────────────────────────────────────────────────────
const labelStyle = { display: "block", marginBottom: 6, fontSize: "0.8rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" };
const inputStyle = { width: "100%", padding: "9px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: "0.9rem", background: "#f8fafc", color: "#0f172a", outline: "none", boxSizing: "border-box" };

const statusStyle = (s) => ({
  pending: { background: "#fef3c7", color: "#d97706" },
  in_progress: { background: "#ede9fe", color: "#6366f1" },
  completed: { background: "#dcfce7", color: "#15803d" },
}[s] || { background: "#f1f5f9", color: "#64748b" });

const statusLabel = (s) => ({
  pending: "⏳ Pending",
  in_progress: "🔄 In Progress",
  completed: "✅ Completed",
}[s] || s);

const priorityStyle = (p) => ({
  low: { background: "#dcfce7", color: "#15803d" },
  medium: { background: "#fef9c3", color: "#a16207" },
  high: { background: "#fee2e2", color: "#b91c1c" },
}[p] || { background: "#f1f5f9", color: "#64748b" });

export default Charts;