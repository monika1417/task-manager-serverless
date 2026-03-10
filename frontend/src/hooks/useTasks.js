import { useState, useCallback } from "react";
import axios from "../api/axiosInstance";

/**
 * Custom hook to handle all task-related operations.
 * Separates business logic from the UI for better scalability.
 */
export const useTasks = () => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get("tasks/");
      setTasks(res.data);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to fetch tasks");
    } finally {
      setLoading(false);
    }
  }, []);

  const createTask = async (taskData) => {
    try {
      await axios.post("tasks/create/", taskData);
      await fetchTasks();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.response?.data?.message || "Failed to create task" };
    }
  };

  const updateTask = async (id, taskData) => {
    try {
      await axios.put(`tasks/update/${id}/`, taskData);
      await fetchTasks();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.response?.data?.message || "Failed to update task" };
    }
  };

  const deleteTask = async (id) => {
    try {
      await axios.delete(`tasks/delete/${id}/`);
      await fetchTasks();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.response?.data?.message || "Failed to delete task" };
    }
  };

  return {
    tasks,
    loading,
    error,
    fetchTasks,
    createTask,
    updateTask,
    deleteTask
  };
};
