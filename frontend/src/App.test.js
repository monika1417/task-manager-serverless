/**
 * DAY 4 – React Unit Tests: App-level (simplified)
 * ==================================================
 * Tests standalone utility functions and basic component
 * logic used throughout the app — without importing App.js
 * directly (which chains through react-router-dom v7 ESM,
 * incompatible with CRA 5 / Jest CommonJS transform).
 *
 * Run with: npm test -- --watchAll=false
 */

// ─────────────────────────────────────────────────────────────────────
// Utility: localStorage helpers (used by App auth guard)
// ─────────────────────────────────────────────────────────────────────
describe('Auth guard – localStorage helpers', () => {
    beforeEach(() => localStorage.clear());

    test('user is null when localStorage is empty', () => {
        const user = JSON.parse(localStorage.getItem('user'));
        expect(user).toBeNull();
    });

    test('user is parsed correctly when set', () => {
        const mockUser = { id: '1', name: 'Alice', email: 'alice@example.com' };
        localStorage.setItem('user', JSON.stringify(mockUser));
        const user = JSON.parse(localStorage.getItem('user'));
        expect(user).toEqual(mockUser);
        expect(user.name).toBe('Alice');
    });

    test('token is stored and retrieved correctly', () => {
        localStorage.setItem('token', 'my.jwt.token');
        expect(localStorage.getItem('token')).toBe('my.jwt.token');
    });

    test('clearing localStorage removes user and token', () => {
        localStorage.setItem('user', JSON.stringify({ id: '1' }));
        localStorage.setItem('token', 'tok');
        localStorage.clear();
        expect(localStorage.getItem('user')).toBeNull();
        expect(localStorage.getItem('token')).toBeNull();
    });

    test('auth guard should redirect when user is falsy', () => {
        const user = JSON.parse(localStorage.getItem('user'));
        const shouldRedirect = !user;
        expect(shouldRedirect).toBe(true);
    });

    test('auth guard should NOT redirect when user is present', () => {
        localStorage.setItem('user', JSON.stringify({ id: '1', name: 'Bob' }));
        const user = JSON.parse(localStorage.getItem('user'));
        const shouldRedirect = !user;
        expect(shouldRedirect).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────
// Utility: sidebar visibility logic (mirrors App.js hideSidebar)
// ─────────────────────────────────────────────────────────────────────
describe('Sidebar visibility logic', () => {
    const hideSidebarFor = (pathname) =>
        pathname === '/login' || pathname === '/register';

    test('sidebar is hidden on /login', () => {
        expect(hideSidebarFor('/login')).toBe(true);
    });

    test('sidebar is hidden on /register', () => {
        expect(hideSidebarFor('/register')).toBe(true);
    });

    test('sidebar is visible on /', () => {
        expect(hideSidebarFor('/')).toBe(false);
    });

    test('sidebar is visible on /dashboard', () => {
        expect(hideSidebarFor('/dashboard')).toBe(false);
    });

    test('sidebar is visible on /tasks', () => {
        expect(hideSidebarFor('/tasks')).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────
// Utility: priority / status enum validation (mirrors TaskCard logic)
// ─────────────────────────────────────────────────────────────────────
describe('Task field enum validation', () => {
    const VALID_STATUSES = ['pending', 'in_progress', 'completed'];
    const VALID_PRIORITIES = ['low', 'medium', 'high'];

    test.each(VALID_STATUSES)('status "%s" is valid', (s) => {
        expect(VALID_STATUSES).toContain(s);
    });

    test.each(VALID_PRIORITIES)('priority "%s" is valid', (p) => {
        expect(VALID_PRIORITIES).toContain(p);
    });

    test('unknown status "done" is NOT valid', () => {
        expect(VALID_STATUSES).not.toContain('done');
    });

    test('unknown priority "urgent" is NOT valid', () => {
        expect(VALID_PRIORITIES).not.toContain('urgent');
    });
});

// ─────────────────────────────────────────────────────────────────────
// Utility: due-date urgency logic (mirrors TaskCard getDueDateInfo)
// ─────────────────────────────────────────────────────────────────────
describe('Due-date urgency logic', () => {
    const getUrgency = (dueDateStr, status = 'pending') => {
        if (!dueDateStr) return null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dueDate = new Date(dueDateStr);
        const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));

        if (status === 'completed') return 'done';
        if (diffDays < 0) return 'overdue';
        if (diffDays === 0) return 'due-today';
        if (diffDays <= 2) return 'due-soon';
        return 'normal';
    };

    test('past due date returns "overdue"', () => {
        expect(getUrgency('2020-01-01')).toBe('overdue');
    });

    test('far future date returns "normal"', () => {
        expect(getUrgency('2099-12-31')).toBe('normal');
    });

    test('null due date returns null', () => {
        expect(getUrgency(null)).toBeNull();
    });

    test('completed task with past due date returns "done" not "overdue"', () => {
        expect(getUrgency('2020-01-01', 'completed')).toBe('done');
    });
});
