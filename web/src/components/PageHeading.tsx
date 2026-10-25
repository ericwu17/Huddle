export default function PageHeading({ lead, accent }: { lead?: string; accent: string }) {
  return <h1 className="page-heading">{lead ? <span>{lead}</span> : null}<span className="page-heading-accent">
    <span className="sr-only">{accent}</span>
    <span aria-hidden="true">{accent.split(/(\s+)/).map((word, i) => /^\s+$/.test(word) ? word : <span className="page-heading-word" key={i}><span className="page-heading-word-art">{word}</span></span>)}</span>
  </span></h1>;
}
