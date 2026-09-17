// Shared test helper for authenticating as a fresh user through the *real* auth flow
// (Google OAuth). The app has no password-based auth anymore (see CODE_REVIEW.md C3) —
// this mocks only the network call to Google (OAuth2Client.verifyIdToken), so everything
// downstream (JWT issuance, user creation/lookup in Postgres) exercises real app code.
import request from 'supertest';
import { OAuth2Client } from 'google-auth-library';
import app from '../../src/index';

let counter = 0;

export interface TestUser {
  token: string;
  user: { id: string; name: string; email: string; role: string };
  email: string;
}

/**
 * Logs in as a brand-new user via POST /api/auth/google, with Google's ID-token
 * verification mocked to return a fixed payload. Each call uses a unique email so
 * parallel/sequential tests don't collide on the User.email unique constraint.
 */
export async function loginAsNewUser(overrides: { name?: string } = {}): Promise<TestUser> {
  counter += 1;
  // Date.now() alone can collide across parallel Jest worker processes (each starts its own
  // `counter` at 0), so mix in a random suffix too.
  const email = `test-user-${Date.now()}-${counter}-${Math.random().toString(36).slice(2, 10)}@example.com`;
  const name = overrides.name ?? 'Test User';

  // Cast the spy target to `any` — google-auth-library's `verifyIdToken` overloads make the
  // strict jest.spyOn generic inference awkward to satisfy; we only need to fake its resolved
  // shape (`{ getPayload() }`), not reproduce its real type.
  const verifySpy = jest
    .spyOn(OAuth2Client.prototype as any, 'verifyIdToken')
    .mockResolvedValueOnce({
      getPayload: () => ({
        email,
        name,
        picture: 'https://ui-avatars.com/api/?name=Test',
        sub: `google-${email}`,
      }),
    } as any);

  const res = await request(app).post('/api/auth/google').send({ idToken: 'mock-id-token' });

  verifySpy.mockRestore();

  if (res.statusCode !== 200 || !res.body?.token) {
    throw new Error(
      `loginAsNewUser: /api/auth/google did not return a token (status ${res.statusCode}): ${JSON.stringify(res.body)}`
    );
  }

  return { token: res.body.token as string, user: res.body.user, email };
}
