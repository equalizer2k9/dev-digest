/* /repos/:repoId/conventions — Conventions Extractor. Thin entry: the whole
   screen lives in _components/ConventionsView, which reads :repoId itself. */
import { ConventionsView } from "./_components/ConventionsView";

export default function ConventionsPage() {
  return <ConventionsView />;
}
