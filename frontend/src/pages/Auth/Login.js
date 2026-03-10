import { useState } from "react";
import axios from "../../api/axiosInstance";
import { useNavigate, Link } from "react-router-dom";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = (e) => {
    e.preventDefault();
    setLoading(true);

    axios.post("auth/login/", {
      email,
      password
    })
      .then(res => {
        localStorage.setItem("access", res.data.access);
        localStorage.setItem("user", JSON.stringify(res.data.user));
        navigate("/");
      })
      .catch(err => {
        alert(err.response?.data?.error || "Login failed");
      })
      .finally(() => setLoading(false));
  };

  return (
    <div className="auth-container">
      <div className="auth-box">
        <h2 className="auth-title">Welcome Back</h2>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: "1rem" }}>
            <input
              className="form-input"
              type="email"
              placeholder="Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div style={{ marginBottom: "2rem" }}>
            <input
              className="form-input"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn-primary" style={{ width: "100%", padding: "12px" }} disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <p style={{ marginTop: "1.5rem", fontSize: "0.9rem" }}>
          Don't have an account? <Link to="/register" style={{ color: "var(--primary)", fontWeight: "600", textDecoration: "none" }}>Sign up</Link>
        </p>
      </div>
    </div>
  );
}

export default Login;
