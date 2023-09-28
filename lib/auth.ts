import { NextAuthOptions } from "next-auth";
import { Provider } from "next-auth/providers/index";
import Auth0Provider from "next-auth/providers/auth0";
import KeycloakProvider from "next-auth/providers/keycloak";
import { Session } from "next-auth";

export interface SunriseSession extends Session {
  idToken?: string;
}

var provider: Provider;

if (
  process.env.AUTH0_ISSUER &&
  process.env.AUTH0_CLIENT_ID &&
  process.env.AUTH0_CLIENT_SECRET
) {
  provider = Auth0Provider({
    issuer: process.env.AUTH0_ISSUER,
    clientId: process.env.AUTH0_CLIENT_ID,
    clientSecret: process.env.AUTH0_CLIENT_SECRET,

  });
} else if (
  process.env.KEYCLOAK_ISSUER &&
  process.env.KEYCLOAK_CLIENT_ID &&
  process.env.KEYCLOAK_CLIENT_SECRET
) {
  provider = KeycloakProvider({
    issuer: process.env.KEYCLOAK_ISSUER,
    clientId: process.env.KEYCLOAK_CLIENT_ID,
    clientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
  });
} else {
  throw new Error("No valid auth provider configured");
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [provider],
  callbacks: {
    async jwt({ token, account }) {
      if (account && account.id_token) {
        token.idToken = account.id_token;
      }

      return token
    },

    async session({ session, token }: { session: SunriseSession, token: any }) {
      session.idToken = token.idToken
      return session
    }
  }
};
