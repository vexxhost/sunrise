import {
  IdentityClient,
  fetchProjectScopedToken,
} from "@/lib/keystone";
import { session } from "@/lib/session";
import { startFederatedAuth } from "@/lib/auth";

export default async function Page() {
  const unscopedToken = await session().get('keystone_unscoped_token');
  if (!unscopedToken) {
    return startFederatedAuth();
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
