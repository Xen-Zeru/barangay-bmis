import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { LoginPage } from '../pages/LoginPage';

const { loginMock } = vi.hoisted(() => ({
  loginMock: vi.fn(),
}));

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    status: 'anonymous',
    login: loginMock,
    logout: vi.fn(),
  }),
}));

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<div>Dashboard destination</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  loginMock.mockReset();
});

describe('LoginPage', () => {
  it('requires both credentials before calling the API', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter your username and password.',
    );
    expect(loginMock).not.toHaveBeenCalled();
  });

  it('signs in and redirects to the dashboard', async () => {
    const user = userEvent.setup();
    loginMock.mockResolvedValue({
      id: 'user-1',
      username: 'secretary',
      role: 'BARANGAY_SECRETARY',
    });
    renderLogin();

    await user.type(screen.getByLabelText('Username'), 'secretary');
    await user.type(
      screen.getByLabelText('Password'),
      'TestPassword!2026',
    );
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Dashboard destination')).toBeInTheDocument();
    expect(loginMock).toHaveBeenCalledWith('secretary', 'TestPassword!2026');
  });

  it('shows the server error when sign-in is rejected', async () => {
    const user = userEvent.setup();
    loginMock.mockRejectedValue(
      new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid username or password.'),
    );
    renderLogin();

    await user.type(screen.getByLabelText('Username'), 'secretary');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid username or password.',
    );
    expect(screen.queryByText('Dashboard destination')).not.toBeInTheDocument();
  });

  it('toggles password visibility', async () => {
    const user = userEvent.setup();
    renderLogin();

    const password = screen.getByLabelText('Password');
    expect(password).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: /show password/i }));
    expect(password).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: /hide password/i }));
    expect(password).toHaveAttribute('type', 'password');
  });
});
