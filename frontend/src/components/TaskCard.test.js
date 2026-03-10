/**
 * DAY 4 – React Unit Tests: TaskCard Component
 * ==============================================
 * Tests rendering, priority/status badges, due-date logic,
 * and all action buttons using @testing-library/react + Jest.
 *
 * Run with: npm test -- --watchAll=false
 */

import { render, screen, fireEvent } from '@testing-library/react';
import TaskCard from './TaskCard';

// ── Mock react-icons so they don't break Jest ─────────────────────────
jest.mock('react-icons/fa', () => ({
  FaCheck: () => <span data-testid="icon-check">✓</span>,
  FaUndo: () => <span data-testid="icon-undo">↩</span>,
  FaPencilAlt: () => <span data-testid="icon-pencil">✏</span>,
  FaTrash: () => <span data-testid="icon-trash">🗑</span>,
  FaCalendarAlt: () => <span data-testid="icon-calendar">📅</span>,
  FaExclamationCircle: () => <span data-testid="icon-exclamation">!</span>,
}));

// ── Shared mock data ───────────────────────────────────────────────────
const mockTask = {
  id: 'task_001',
  title: 'Test Task',
  description: 'Test Description',
  status: 'pending',
  priority: 'high',
  created_at: '2026-02-18T00:00:00Z',
  due_date: '2099-12-31T00:00:00Z',   // far future → no urgency
};

const mockFns = {
  toggleStatus: jest.fn(),
  deleteTask: jest.fn(),
  editTask: jest.fn(),
};

const renderCard = (taskOverrides = {}) =>
  render(
    <TaskCard
      task={{ ...mockTask, ...taskOverrides }}
      toggleStatus={mockFns.toggleStatus}
      deleteTask={mockFns.deleteTask}
      editTask={mockFns.editTask}
    />
  );

beforeEach(() => jest.clearAllMocks());

// ─────────────────────────────────────────────────────────────────────
// RENDERING
// ─────────────────────────────────────────────────────────────────────
describe('TaskCard – rendering', () => {
  test('renders task title', () => {
    renderCard();
    expect(screen.getByText('Test Task')).toBeInTheDocument();
  });

  test('renders task description', () => {
    renderCard();
    expect(screen.getByText('Test Description')).toBeInTheDocument();
  });

  test('shows "No description provided." when description is empty', () => {
    renderCard({ description: '' });
    expect(screen.getByText('No description provided.')).toBeInTheDocument();
  });

  test('renders High Priority badge', () => {
    renderCard({ priority: 'high' });
    expect(screen.getByText(/High Priority/i)).toBeInTheDocument();
  });

  test('renders Medium Priority badge', () => {
    renderCard({ priority: 'medium' });
    expect(screen.getByText(/Medium Priority/i)).toBeInTheDocument();
  });

  test('renders Low Priority badge', () => {
    renderCard({ priority: 'low' });
    expect(screen.getByText(/Low Priority/i)).toBeInTheDocument();
  });

  test('renders ⏳ Pending status badge', () => {
    renderCard({ status: 'pending' });
    expect(screen.getByText(/Pending/i)).toBeInTheDocument();
  });

  test('renders ✅ Completed status badge', () => {
    renderCard({ status: 'completed' });
    expect(screen.getByText(/Completed/i)).toBeInTheDocument();
  });

  test('renders 🔄 In Progress status badge', () => {
    renderCard({ status: 'in_progress' });
    expect(screen.getByText(/In Progress/i)).toBeInTheDocument();
  });

  test('renders created_at date', () => {
    renderCard();
    expect(screen.getByText(/Created:/i)).toBeInTheDocument();
  });

  test('renders future due date label', () => {
    renderCard({ due_date: '2099-12-31T00:00:00Z' });
    expect(screen.getByText(/Due/i)).toBeInTheDocument();
  });

  test('does not render due date when due_date is null', () => {
    renderCard({ due_date: null });
    expect(screen.queryByText(/Overdue/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Due Today/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Due Soon/i)).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────
// ACTION BUTTONS
// ─────────────────────────────────────────────────────────────────────
describe('TaskCard – action buttons', () => {
  test('toggle button shows "Mark as Completed" title when pending', () => {
    renderCard({ status: 'pending' });
    const btn = screen.getByTitle('Mark as Completed');
    expect(btn).toBeInTheDocument();
  });

  test('toggle button shows "Mark as Pending" title when completed', () => {
    renderCard({ status: 'completed' });
    const btn = screen.getByTitle('Mark as Pending');
    expect(btn).toBeInTheDocument();
  });

  test('clicking toggle button calls toggleStatus once', () => {
    renderCard({ status: 'pending' });
    fireEvent.click(screen.getByTitle('Mark as Completed'));
    expect(mockFns.toggleStatus).toHaveBeenCalledTimes(1);
  });

  test('clicking edit button calls editTask once', () => {
    renderCard();
    fireEvent.click(screen.getByTitle('Edit Task'));
    expect(mockFns.editTask).toHaveBeenCalledTimes(1);
  });

  test('clicking delete button calls deleteTask once', () => {
    renderCard();
    fireEvent.click(screen.getByTitle('Delete Task'));
    expect(mockFns.deleteTask).toHaveBeenCalledTimes(1);
  });

  test('delete button does NOT call toggleStatus', () => {
    renderCard();
    fireEvent.click(screen.getByTitle('Delete Task'));
    expect(mockFns.toggleStatus).not.toHaveBeenCalled();
  });

  test('multiple button clicks are counted correctly', () => {
    renderCard({ status: 'pending' });
    const toggleBtn = screen.getByTitle('Mark as Completed');
    fireEvent.click(toggleBtn);
    fireEvent.click(toggleBtn);
    fireEvent.click(toggleBtn);
    expect(mockFns.toggleStatus).toHaveBeenCalledTimes(3);
  });
});

// ─────────────────────────────────────────────────────────────────────
// DUE DATE LOGIC
// ─────────────────────────────────────────────────────────────────────
describe('TaskCard – due date urgency (non-completed tasks)', () => {
  test('overdue task shows "Overdue" label', () => {
    renderCard({ status: 'pending', due_date: '2020-01-01T00:00:00Z' });
    expect(screen.getByText(/Overdue/i)).toBeInTheDocument();
  });

  test('due_date far in future shows "Due" without urgency', () => {
    renderCard({ status: 'pending', due_date: '2099-01-01T00:00:00Z' });
    expect(screen.getByText(/Due/i)).toBeInTheDocument();
    expect(screen.queryByText(/Overdue/i)).not.toBeInTheDocument();
  });

  test('completed task does NOT show Overdue even if past due_date', () => {
    renderCard({ status: 'completed', due_date: '2020-01-01T00:00:00Z' });
    expect(screen.queryByText(/Overdue/i)).not.toBeInTheDocument();
  });
});
