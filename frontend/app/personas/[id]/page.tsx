import PersonaDetail from "./persona-detail";

/**
 * Persona detail route. Next.js supplies the dynamic `id` via params; the page
 * delegates to the client `PersonaDetail` component (which owns fetch + edit),
 * keeping this wrapper a thin shell so the logic stays directly unit-testable.
 */
export default function PersonaDetailPage({
  params,
}: {
  params: { id: string };
}): React.ReactElement {
  return <PersonaDetail id={params.id} />;
}
