import type { OptionLabel } from "../optionLabels";

export default function OptionLabels({ labels = [] }: { labels?: readonly OptionLabel[] }) {
  return labels.length ? <span className="option-labels" aria-label="Option highlights">
    {labels.map(label => <span key={label.kind} className={`option-label option-label-${label.kind}`} title={label.detail}
      aria-label={`${label.text}. ${label.detail}`}>{label.text}</span>)}
  </span> : null;
}
