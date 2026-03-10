import { useState } from "react";
import axios from "../../api/axiosInstance";
import { useNavigate, Link } from "react-router-dom";

function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleRegister = (e) => {
    e.preventDefault();
    setLoading(true);

    axios.post("auth/register/", {
      name,
      email,
      password,
      role: isAdmin ? "admin" : "user"
    })
      .then(() => {
        alert("Registration successful! Please login.");
        navigate("/login");
      })
      .catch(err => {
        alert(err.response?.data?.error || "Registration failed");
      })
      .finally(() => setLoading(false));
  };

  return (
    <div className="auth-container">
      <div className="auth-box">
        <h2 className="auth-title">Create Account</h2>

        <form onSubmit={handleRegister}>
          <div style={{ marginBottom: "1rem" }}>
            <input
              className="form-input"
              type="text"
              placeholder="Full Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

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

          <div style={{ marginBottom: "1.5rem", display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input 
              type="checkbox" 
              id="role" 
              checked={isAdmin} 
              onChange={(e) => setIsAdmin(e.target.checked)} 
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
            <label htmlFor="role" style={{ fontSize: '0.9rem', cursor: 'pointer', color: '#666' }}>Register as Administrator</label>
          </div>

          <button type="submit" className="btn-primary" style={{ width: "100%", padding: "12px" }} disabled={loading}>
            {loading ? "Creating Account..." : "Sign Up"}
          </button>
        </form>

        <p style={{ marginTop: "1.5rem", fontSize: "0.9rem" }}>
          Already have an account? <Link to="/login" style={{ color: "var(--primary)", fontWeight: "600", textDecoration: "none" }}>Log in</Link>
        </p>
      </div>
    </div>
  );
}

export default Register;
