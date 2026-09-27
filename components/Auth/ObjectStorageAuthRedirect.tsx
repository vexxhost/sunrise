'use client';

import { useEffect } from 'react';

const S3_AUTH_LOGIN_PATH = '/object-storage/auth/login';

export function ObjectStorageAuthRedirect() {
  useEffect(() => {
    const loginUrl = new URL(S3_AUTH_LOGIN_PATH, window.location.origin);
    loginUrl.searchParams.set(
      'returnTo',
      `${window.location.pathname}${window.location.search}${window.location.hash}`,
    );
    window.location.replace(loginUrl.toString());
  }, []);

  return null;
}
