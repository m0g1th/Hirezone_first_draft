import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Challenge = {
  challenge_id: number;
  recruiter_id: number;
  challenge_title: string;
  description: string;
  domain: string;
  difficulty_level: string;
  points_available: number;
  start_date: string;
  deadline: string;
  challenge_status: string;
  estimated_duration: string;
};

type RecruiterChallengesProps = {
  recruiterId: number;
  onSelectChallenge: (challengeId: number) => void;
};

export default function RecruiterChallenges({
  recruiterId,
  onSelectChallenge,
}: RecruiterChallengesProps) {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadChallenges();
  }, [recruiterId]);

  async function loadChallenges() {
    setLoading(true);

    const { data, error } = await supabase
      .from("sponsored_challenges")
      .select("*")
      .eq("recruiter_id", recruiterId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setError(error.message);
      setLoading(false);
      return;
    }

    setChallenges(data || []);
    setLoading(false);
  }

  if (loading) {
    return <div>Loading challenges...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div>
      <h1>My Sponsored Challenges</h1>

      <div className="challenges-grid">
        {challenges.map((challenge) => (
          <div
            key={challenge.challenge_id}
            className="challenge-card"
          >
            <h2>{challenge.challenge_title}</h2>

            <p>{challenge.description}</p>

            <p>
              <strong>Domain:</strong>{" "}
              {challenge.domain}
            </p>

            <p>
              <strong>Difficulty:</strong>{" "}
              {challenge.difficulty_level}
            </p>

            <p>
              <strong>Status:</strong>{" "}
              {challenge.challenge_status}
            </p>

            <p>
              <strong>Deadline:</strong>{" "}
              {challenge.deadline}
            </p>

            <button
              onClick={() =>
                onSelectChallenge(
                  challenge.challenge_id
                )
              }
            >
              View Candidates
            </button>
          </div>
        ))}
      </div>

      {challenges.length === 0 && (
        <p>No sponsored challenges found.</p>
      )}
    </div>
  );
}