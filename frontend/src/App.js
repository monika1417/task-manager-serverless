import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useState } from "react";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Auth/Login";
import Register from "./pages/Auth/Register";
import "./App.css";
import Charts from "./pages/Charts";
import AdminDashboard from "./pages/AdminDashboard";

function LayoutWrapper() {
  const location = useLocation();
  const user = JSON.parse(localStorage.getItem("user"));

  const [collapsed, setCollapsed] = useState(false);

  const hideSidebar =
    location.pathname === "/login" ||
    location.pathname === "/register";

  // Protect route
  if (!user && !hideSidebar) {
    return <Navigate to="/login" />;
  }

  return (
    <div className="layout">

      {!hideSidebar && (
        <Sidebar
          collapsed={collapsed}
          toggle={() => setCollapsed(prev => !prev)}
        />
      )}

      <div className="content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/charts"
            element={user?.role === "admin" ? <Charts /> : <Navigate to="/" />}
          />
          <Route
            path="/admin"
            element={user?.role === "admin" ? <AdminDashboard /> : <Navigate to="/" />}
          />
        </Routes>
      </div>

    </div>
  );
}

function App() {
  return (
    <Router>
      <LayoutWrapper />
    </Router>
  );
}

export default App;
