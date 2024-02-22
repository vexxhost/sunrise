import nextAppSession, { MemoryStore } from 'next-app-session';

export type SunriseSession = {
  keystone_unscoped_token?: string;
  keystone_token?: string;
  projects?: [],
  selectedProject?: number

  redirect_to?: string;
}

// Setup the config for your session and cookie
export const session = nextAppSession<SunriseSession>({
   secret: process.env.SESSION_SECRET,
   // TODO(mnaser): Make this configurable for production setups
   store: new MemoryStore(),
}); 
