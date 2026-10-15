/* /repos/:repoId/context — Project Context. Thin entry: the whole screen lives
   in _components/ProjectContextView, which reads :repoId itself. */
import { ProjectContextView } from "./_components/ProjectContextView";

export default function ProjectContextPage() {
  return <ProjectContextView />;
}
