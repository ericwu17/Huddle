function HeadingWords({ text }: { text: string }) {
  return <>
    <span className="sr-only">{text}</span>
    <span aria-hidden="true">{text.split(/(\s+)/).map((word, i) => /^\s+$/.test(word) ? word : <span className="page-heading-word" key={i}><span className="page-heading-word-art">{word}</span></span>)}</span>
  </>;
}

export default function PageHeading({ lead, accent }: { lead?: string; accent: string }) {
  return <h1 className="page-heading">
    {lead ? <span className="page-heading-lead"><HeadingWords text={lead} /></span> : null}
    <span className="page-heading-accent"><HeadingWords text={accent} /></span>
  </h1>;
}
