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
  process.env.ID_PROVIDER_ISSUER &&
  process.env.ID_PROVIDER_CLIENT_ID &&
  process.env.ID_PROVIDER_CLIENT_SECRET
) {
  provider = Auth0Provider({
    issuer: process.env.ID_PROVIDER_ISSUER,
    clientId: process.env.ID_PROVIDER_CLIENT_ID,
    clientSecret: process.env.ID_PROVIDER_CLIENT_SECRET,

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
