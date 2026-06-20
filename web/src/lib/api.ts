import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  timeout: 10_000,
  withCredentials: true, // send/receive httpOnly cookies on every request
});

export default api;
