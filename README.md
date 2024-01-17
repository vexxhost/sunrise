# Sunrise

## Getting Started

1. Create a client inside Keycloak which will be used for authenticating
   the user using Sunrise.

2. Make a copy of the file `.env.dist` and rename the copy to `.env.local` in the root of the project and update the
   variables (refer to the values as examples):

3. Start the development server

   ```bash
   npm run dev -- -p 9990
   ```

4. Navigate to the following URL and login with Keycloak:

   [http://localhost:3000/api/auth/signin](http://localhost:3000/api/auth/signin)

5. Go to the following URL to see the user's information:

   [http://localhost:3000/protected](http://localhost:3000/protected)

6. Go to the following URL to signout:

   [http://localhost:3000/api/auth/signout](http://localhost:3000/api/auth/signout)
