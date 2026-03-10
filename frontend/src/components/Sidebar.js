import { Link, useLocation, useNavigate } from "react-router-dom";
import { FaBars, FaThLarge, FaSignOutAlt, FaChartPie, FaShieldAlt } from "react-icons/fa";
import { useState, useRef, useEffect } from "react";

function Sidebar({ collapsed, toggle }) {
  const user = JSON.parse(localStorage.getItem("user"));
  const [showMenu, setShowMenu] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const dropdownRef = useRef();

  const logout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("access");
    navigate("/login");
  };

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={`sidebar ${collapsed ? "hidden" : ""}`}>
      <div className="sidebar-header">
        <div className="logo-text">TaskPro</div>
        <button onClick={toggle} className="toggle-btn">
          <FaBars />
        </button>
      </div>

      <nav>
        <Link
          to="/"
          className={`nav-link ${location.pathname === "/" ? "active" : ""}`}
        >
          <FaThLarge />
          <span>Dashboard</span>
        </Link>

        {user?.role === "admin" && (
          <Link
            to="/charts"
            className={`nav-link ${location.pathname === "/charts" ? "active" : ""}`}
          >
            <FaChartPie />
            <span>Analytics</span>
          </Link>
        )}

        {user?.role === "admin" && (
          <Link
            to="/admin"
            className={`nav-link ${location.pathname === "/admin" ? "active" : ""}`}
          >
            <FaShieldAlt />
            <span>Admin</span>
          </Link>
        )}
      </nav>

      {/* User profile at bottom */}
      <div className="user-section" ref={dropdownRef}>
        <div className="user-avatar" onClick={() => setShowMenu(!showMenu)}>
          <div className="avatar-circle">
            {user?.name?.charAt(0).toUpperCase() || "U"}
          </div>
          {!collapsed && (
            <div className="user-info">
              <div className="user-name">{user?.name || "User"}</div>
              <div className="user-email">{user?.email || ""}</div>
            </div>
          )}
        </div>

        {showMenu && (
          <div className="dropdown-menu">
            <button className="dropdown-item" onClick={logout}>
              <FaSignOutAlt style={{ marginRight: "8px" }} /> Logout
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default Sidebar;
