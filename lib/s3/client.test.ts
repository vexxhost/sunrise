import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureActiveProjectS3Credentials: vi.fn(),
  getActiveS3Credentials: vi.fn(),
  getS3Endpoint: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('@/lib/session', () => ({
  getActiveS3Credentials: mocks.getActiveS3Credentials,
  getSession: mocks.getSession,
}));

vi.mock('@/lib/s3/endpoint', () => ({
  getS3Endpoint: mocks.getS3Endpoint,
  S3_REGION: 'RegionOne',
}));

vi.mock('@/lib/s3/session', () => ({
  ensureActiveProjectS3Credentials:
    mocks.ensureActiveProjectS3Credentials,
}));

import { getS3Client, S3AuthRequiredError } from '@/lib/s3/client';

const credentials = {
  accessKeyId: 'access-key',
  secretAccessKey: 'secret-key',
  sessionToken: 'session-token',
  expiration: Date.now() + 3_600_000,
  projectId: 'project-id',
};

describe('getS3Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getS3Endpoint.mockResolvedValue('https://object.example.test');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses existing credentials without refreshing by default', async () => {
    const session = { projectId: 'project-id' };
    mocks.getSession.mockResolvedValue(session);
    mocks.getActiveS3Credentials.mockReturnValue(credentials);

    const client = await getS3Client();

    expect(mocks.getActiveS3Credentials).toHaveBeenCalledWith(session);
    expect(mocks.ensureActiveProjectS3Credentials).not.toHaveBeenCalled();
    client.destroy();
  });

  it('refreshes credentials only when explicitly allowed', async () => {
    const session = { projectId: 'project-id' };
    mocks.getSession.mockResolvedValue(session);
    mocks.ensureActiveProjectS3Credentials.mockResolvedValue(credentials);

    const client = await getS3Client({ allowCredentialRefresh: true });

    expect(mocks.ensureActiveProjectS3Credentials).toHaveBeenCalledWith(session);
    expect(mocks.getActiveS3Credentials).not.toHaveBeenCalled();
    client.destroy();
  });

  it('requires authentication when no current credentials are available', async () => {
    mocks.getSession.mockResolvedValue({ projectId: 'project-id' });
    mocks.getActiveS3Credentials.mockReturnValue(undefined);

    await expect(getS3Client()).rejects.toBeInstanceOf(S3AuthRequiredError);
    expect(mocks.ensureActiveProjectS3Credentials).not.toHaveBeenCalled();
  });
});
