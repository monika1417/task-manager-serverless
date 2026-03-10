// import axios from "axios";

// const axiosInstance = axios.create({
// baseURL: "http://127.0.0.1:8000/api/",
//   baseURL: "http://44.206.47.65:8000",
// });
// const axiosInstance = axios.create({
//   baseURL: "http://44.206.47.65:8000/api",
// });

// axiosInstance.interceptors.request.use((config) => {
//   const token = localStorage.getItem("access");
//   if (token) {
//     config.headers.Authorization = `Bearer ${token}`;
//   }
//   return config;
// });

// export default axiosInstance;




import axios from "axios";

const axiosInstance = axios.create({
  baseURL: process.env.REACT_APP_API_URL || "https://3qk08knqsb.execute-api.us-east-1.amazonaws.com/api",
});

axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem("access");

  // ❌ Do NOT attach token for login/register
  if (
    token &&
    !config.url.includes("login") &&
    !config.url.includes("register")
  ) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export default axiosInstance;