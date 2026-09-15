import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Candidate = {
  challenge_id: number;
  recruiter_id: number;
  proof_id: number;

  student_id: number;
  student_name: string;
  email: string;
  phone: string;

  location: string;
  district: string;

  education: string;
  college_name: string;
  graduation_year: number;

  project_id: number;
  project_name: string;
  project_description: string;
  project_domain: string;

  technologies: string | null;

  github_url: string | null;
  live_demo_url: string | null;

  project_role: string | null;

  project_score: number | null;
  ai_project_score: number | null;

  skill_level: string | null;

  assessment_score: number | null;
  assessment_passed: boolean | null;

  skills: string[] | null;

  milestones_completed: number | null;

  ai_test_score: number | null;
  ai_test_passed: boolean | null;

  badges_earned: number | null;

  profile_score: number | null;
};

type ChallengeCandidatesProps = {
  recruiterId: number;
  challengeId: number;
  onBack: () => void;
};

export default function ChallengeCandidates({
  recruiterId,
  challengeId,
  onBack,
}: ChallengeCandidatesProps) {
  const [candidates, setCandidates] =
    useState<Candidate[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  useEffect(() => {
    loadCandidates();
  }, [challengeId, recruiterId]);

  async function loadCandidates() {
    setLoading(true);

    const { data, error } = await supabase
      .from("recruiter_challenge_candidates_view")
      .select("*")
      .eq("recruiter_id", recruiterId)
      .eq("challenge_id", challengeId)
      .order("profile_score", {
        ascending: false,
      });

    if (error) {
      console.error(error);
      setError(error.message);
      setLoading(false);
      return;
    }

    setCandidates(data || []);
    setLoading(false);
  }

  if (loading) {
    return <div>Loading candidates...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div>
      <button onClick={onBack}>
        ← Back to Challenges
      </button>

      <h1>Challenge Candidates</h1>

      <p>
        {candidates.length} candidates found
      </p>

      <div className="candidates-grid">
        {candidates.map((candidate) => (
          <div
            key={candidate.proof_id}
            className="candidate-card"
          >
            <h2>{candidate.student_name}</h2>

            <p>
              {candidate.education}
            </p>

            <p>
              {candidate.college_name}
            </p>

            <p>
              📍 {candidate.location}
            </p>

            <hr />

            <h3>Project Completed</h3>

            <p>
              <strong>
                {candidate.project_name}
              </strong>
            </p>

            <p>
              {candidate.project_domain}
            </p>

            <h3>Skills</h3>

            <div>
              {candidate.skills?.map(
                (skill) => (
                  <span
                    key={skill}
                    className="skill-tag"
                  >
                    {skill}
                  </span>
                )
              )}
            </div>

            <hr />

            <p>
              Profile Score:{" "}
              <strong>
                {candidate.profile_score}
              </strong>
            </p>

            <p>
              AI Test Score:{" "}
              <strong>
                {candidate.ai_test_score}
              </strong>
            </p>

            <p>
              Assessment:{" "}
              <strong>
                {candidate.assessment_score}
              </strong>
            </p>

            <p>
              Milestones Completed:{" "}
              {candidate.milestones_completed}
            </p>

            <p>
              Badges Earned:{" "}
              {candidate.badges_earned}
            </p>

            {candidate.github_url && (
              <a
                href={candidate.github_url}
                target="_blank"
                rel="noreferrer"
              >
                View GitHub
              </a>
            )}
          </div>
        ))}
      </div>

      {candidates.length === 0 && (
        <p>
          No candidates have completed this
          challenge yet.
        </p>
      )}
    </div>
  );
}