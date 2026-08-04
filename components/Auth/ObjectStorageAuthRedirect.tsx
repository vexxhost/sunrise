'use client';

import { useEffect } from 'react';

const S3_AUTH_LOGIN_PATH = '/object-storage/auth/login';

export function ObjectStorageAuthRedirect() {
  useEffect(() => {
    window.location.replace(S3_AUTH_LOGIN_PATH);
  }, []);

  return null;
}
