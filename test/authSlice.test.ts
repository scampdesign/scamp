import { describe, it, expect, beforeEach } from 'vitest';

import { useAuthStore } from '@store/authSlice';

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'unknown', user: null });
  });

  it('starts unknown, so a gated surface waits rather than flashing in', () => {
    expect(useAuthStore.getState().status).toBe('unknown');
  });

  it('records a signed-in status with the user', () => {
    const user = { id: 'u1', name: 'Angie', email: 'a@example.com', emailVerified: true };
    useAuthStore.getState().applyStatus({ signedIn: true, user });
    expect(useAuthStore.getState()).toMatchObject({ status: 'signed-in', user });
  });

  it('records signed-in with no user when main sends none', () => {
    useAuthStore.getState().applyStatus({ signedIn: true });
    expect(useAuthStore.getState()).toMatchObject({ status: 'signed-in', user: null });
  });

  it('clears the user on sign-out', () => {
    useAuthStore.getState().applyStatus({
      signedIn: true,
      user: { id: 'u1', name: 'A', email: 'a@example.com', emailVerified: true },
    });
    useAuthStore.getState().applyStatus({ signedIn: false });
    expect(useAuthStore.getState()).toMatchObject({ status: 'signed-out', user: null });
  });
});
