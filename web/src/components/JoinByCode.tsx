import { useState } from "react";
import { useNavigate } from "react-router";

// Join with the four-letter code from someone's lobby. Works signed in or out:
// /join/:code uses the account's display name, or asks for a first name.
export default function JoinByCode() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  return (
    <section className="card card-note card-tilt-r space-y-3" aria-label="Join with a code">
      <h2 className="card-title">Got a code?</h2>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.length === 4) navigate(`/join/${code}`);
        }}
      >
        <input
          className="input display text-center text-3xl tracking-[0.3em] uppercase"
          placeholder="ABCD"
          aria-label="Huddle code"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={4}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
        />
        <button className="btn w-full" disabled={code.length !== 4}>
          Join the huddle
        </button>
      </form>
    </section>
  );
}
