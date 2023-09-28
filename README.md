# Sunrise

## Getting Started

1. Create a client inside Keycloak which will be used for authenticating
   the user using Sunrise.

1. Create a file called `.env.local` in the root of the project and add the
   following variables (refer to the values as examples):

   ```bash
   NODE_TLS_REJECT_UNAUTHORIZED=0 # if running against an self-signed certs.
   KEYSTONE_API=https://identity.cloud.atmosphere.dev
   KEYCLOAK_ISSUER=https://keycloak.cloud.atmosphere.dev/realms/atmosphere
   KEYCLOAK_CLIENT_ID=sunrise
   KEYCLOAK_CLIENT_SECRET=secret123
   ```

1. Start the development server

   ```bash
   npm run dev
   ```

1. Navigate to the following URL and login with Keycloak:

   [http://localhost:3000/api/auth/signin](http://localhost:3000/api/auth/signin)

1. Go to the following URL to see the user's information:

   [http://localhost:3000/compute/instances](http://localhost:3000/compute/instances)

1. Go to the following URL to signout:

   [http://localhost:3000/api/auth/signout](http://localhost:3000/api/auth/signout)
