import PersonaDetail from "./persona-detail";
import { RequireAuth } from "../../auth/RequireAuth";

/**
 * Persona detail route. Next.js supplies the dynamic `id` via params; the page
 * delegates to the client `PersonaDetail` component (which owns fetch + edit),
 * keeping this wrapper a thin shell so the logic stays directly unit-testable.
 *
 * Protected route: a persona is owner-scoped, so gate it behind a valid
 * session (RequireAuth was built in 85q.5).
 */
export default function PersonaDetailPage({
  params,
}: {
  params: { id: string };
}): React.ReactElement {
  return (
    <RequireAuth>
      <PersonaDetail id={params.id} />
    </RequireAuth>
  );
}
