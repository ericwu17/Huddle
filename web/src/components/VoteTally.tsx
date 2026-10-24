import type { Votes } from "../types";
import { Buddy } from "../doodle/Doodle";
import Tick from "./Tick";

type Member = { id: string; name: string };

// The strip at the top of the vote screen: how many voted, who is still deciding,
// and whether there is a winner or a tie.
export function VoteStatus({ votes, members, winnerTitle, tiedTitles }: {
  votes: Votes | undefined;
  members: Member[];
  winnerTitle?: string | null;
  tiedTitles?: string[];
}) {
  const voted = new Set(Object.values(votes?.byPlan ?? {}).flat());
  const waiting = members.filter((m) => !voted.has(m.id));
  const total = votes?.total ?? 0;
  return (
    <div className="vote-status" role="status" aria-live="polite">
      <span className="vote-status-count">{total} of {members.length} voted</span>
      {waiting.length ? (
        <span>Waiting on {waiting.map((m) => m.name).join(", ")}</span>
      ) : winnerTitle ? (
        <span className="sticker sticker-lime">Winner: {winnerTitle}</span>
      ) : tiedTitles && tiedTitles.length > 1 ? (
        <span className="sticker sticker-sun">Tie: {tiedTitles.join(" vs ")}. Spin to decide</span>
      ) : null}
    </div>
  );
}

// Under each plan: the vote button, a tally bar and the faces of who picked it.
export function VoteChoice({ planId, title, votes, members, myMemberId, busy, onVote }: {
  planId: string;
  title: string;
  votes: Votes | undefined;
  members: Member[];
  myMemberId: string;
  busy: boolean;
  onVote: () => void;
}) {
  const mine = votes?.myVote === planId;
  const voterIds = votes?.byPlan?.[planId] ?? [];
  const voters = members.filter((m) => voterIds.includes(m.id));
  const share = members.length ? voterIds.length / members.length : 0;
  return (
    <div className={`vote-choice ${mine ? "is-mine" : ""}`}>
      <button
        className={`btn w-full ${mine ? "btn-sun" : "btn-primary"}`}
        disabled={busy}
        aria-pressed={mine}
        onClick={() => { if (!mine) onVote(); }}
      >
        {mine ? <span className="inline-flex items-center gap-2"><Tick size={18} />Your vote: {title}</span> : `Vote for ${title}`}
      </button>
      <div className="vote-bar" aria-hidden="true"><span style={{ width: `${Math.round(share * 100)}%` }} /></div>
      <div className="vote-voters">
        <b>{voterIds.length} {voterIds.length === 1 ? "vote" : "votes"}</b>
        {voters.length ? (
          <ul aria-label={`Voted for ${title}`}>
            {voters.map((m) => (
              <li key={m.id}>
                <Buddy who={m.name} pose="huddle" size={34} />
                <span>{m.id === myMemberId ? "You" : m.name}</span>
              </li>
            ))}
          </ul>
        ) : (
          <span className="muted">No votes yet</span>
        )}
      </div>
    </div>
  );
}
