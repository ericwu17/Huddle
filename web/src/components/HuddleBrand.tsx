import { Link } from "react-router";
import HuddleWordmark from "./HuddleWordmark";

// Every page uses the same corner mark. The config screen sits outside the router.
export default function HuddleBrand({ standalone = false }: { standalone?: boolean }) {
  const mark = <HuddleWordmark decorative />;
  return standalone
    ? <a className="brand-home" href="/start" aria-label="Huddle home">{mark}</a>
    : <Link className="brand-home" to="/start" aria-label="Huddle home">{mark}</Link>;
}
