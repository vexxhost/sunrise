import {
  IdentityClient,
  fetchProjectScopedToken,
  fetchUnscopedTokenWithIdToken,
} from "@/lib/keystone";
import { getSession } from "@/lib/session";

export default async function Page() {
  const session = await getSession();

  const idToken = session?.idToken;
  if (!idToken) {
    return <p>Not logged in</p>;
  }

  const unscopedToken = await fetchUnscopedTokenWithIdToken(
    process.env.KEYSTONE_FEDERATION_IDENTITY_PROVIDER || "atmosphere",
    idToken
  );
  if (!unscopedToken) {
    return <p>Failed to fetch unscoped token</p>;
  }

  const identity = new IdentityClient(
    process.env.KEYSTONE_API || "http://localhost:5000",
    unscopedToken
  );
  const projects = await identity.listUserProjects();

  const scopedToken = await fetchProjectScopedToken(
    unscopedToken,
    projects["projects"][0].id
  );
  if (!scopedToken) {
    return <p>Failed to fetch scoped token</p>;
  }

  return (
    <>
      <div className="p-4">
        <p className="font-bold">ID token</p>
        <pre className="bg-gray-100 p-4 rounded-md overflow-y-auto">
          {idToken}
        </pre>
      </div>

      <div className="p-4">
        <p className="font-bold">Keystone Unscoped Token</p>
        <pre className="bg-gray-100 p-4 rounded-md overflow-y-auto">
          {unscopedToken}
        </pre>
      </div>

      <div className="p-4">
        <p className="font-bold">Projects</p>
        <pre className="bg-gray-100 p-4 rounded-md overflow-y-auto">
          {JSON.stringify(projects, null, 2)}
        </pre>
      </div>

      <div className="p-4">
        <p className="font-bold">
          Keystone Scoped Token (for {projects["projects"][0].name})
        </p>
        <pre className="bg-gray-100 p-4 rounded-md overflow-y-auto">
          {scopedToken}
        </pre>
      </div>
    </>
  );
}
