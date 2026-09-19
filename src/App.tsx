import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react'

import { supabase } from './lib/supabase'
import './App.css'

type Candidate = {
  student_id: number
  student_name: string
  email: string
  location: string
  education: string
  college_name: string
  graduation_year: number
  proof_id?: number | null
  project_name: string
  domain: string
  skills: string[] | null
  ai_test_score: number | null
  ai_test_passed?: boolean | null
  badges_earned: number | null
  milestones_completed?: number | null
  blog_posts_count?: number | null
  district: string | null
  relevance_score: number | null
  matched_challenges: number | null
  direct_projects?: number | null
  match_type?: string | null
}

type CandidateProof = {
  student_id: number
  student_name: string
  email: string
  phone?: string | null
  location: string
  education: string
  college_name: string
  graduation_year: number | null
  proof_id?: number | null
  project_name: string
  domain: string
  skills: string[] | null
  ai_test_score: number | null
  ai_test_passed: boolean | null
  badges_earned: number | null
  milestones_completed: number | null
  blog_posts_count: number | null
  profile_score: number | null
  district?: string | null
  last_updated?: string | null
  github_url?: string | null
  github_repos?: {
    project_name: string
    github_url: string
    live_demo_url?: string | null
  }[]
}

type Filters = {
  skill: string[]
  district: string
  domain: string[]
  minScore: string
  minBadges: string
}

type Challenge = {
  challenge_id: number
  challenge_title: string
  description: string | null
  domain: string | null
  difficulty_level: string | null
  points_available: number | null
  start_date: string | null
  deadline: string | null
  challenge_status: string | null
  estimated_duration: string | null
}

type Connection = {
  connect_id: number
  student_name: string
  student_email: string | null
  company_name: string
  challenge_title: string | null
  message: string | null
  status:
    | 'Sent'
    | 'Viewed'
    | 'Accepted'
    | 'Rejected'
}

type Theme = 'light' | 'dark'

type FontSize = 'small' | 'medium' | 'large'

type RecruiterSession = {
  recruiter_id: number
  company_name: string
  email?: string | null
}

type ConnectStatus =
  | 'none'
  | 'pending'
  | 'accepted'
  | 'unknown'

const DEFAULT_CONNECT_MESSAGE =
  'Your profile and proof of work look impressive. We would like to connect with you regarding potential opportunities.'

const DEFAULT_FILTERS: Filters = {
  skill: [],
  district: '',
  domain: [],
  minScore: '',
  minBadges: '',
}

const SESSION_STORAGE_KEY = 'hirezone:recruiter-session'

const DEFAULT_SKILLS = [
  'JavaScript',
  'TypeScript',
  'Python',
  'Java',
  'React',
  'Node.js',
  'SQL',
  'Machine Learning',
  'Artificial Intelligence',
  'Data Analysis',
  'Cybersecurity',
  'Cloud Computing',
]

const DEFAULT_DOMAINS = [
  'Software Development',
  'Data Science',
  'Artificial Intelligence',
  'Web Development',
  'Cybersecurity',
  'Cloud Computing',
  'Embedded Systems',
  'Electronics',
  'Mechanical Engineering',
]

function getSentStorageKey(recruiterId: number) {
  return `hirezone:pending-requests:${recruiterId}`
}

function loadPendingIdsFor(recruiterId: number): Set<number> {
  try {
    const raw = localStorage.getItem(
      getSentStorageKey(recruiterId),
    )

    if (!raw) {
      return new Set()
    }

    const arr = JSON.parse(raw)

    return new Set(
      Array.isArray(arr) ? arr.map(Number) : [],
    )
  } catch {
    return new Set()
  }
}

function persistPendingIdsFor(
  recruiterId: number,
  ids: Set<number>,
) {
  try {
    localStorage.setItem(
      getSentStorageKey(recruiterId),
      JSON.stringify(Array.from(ids)),
    )
  } catch {
    // Ignore storage errors.
  }
}

function loadStoredSession(): RecruiterSession | null {
  try {
    const raw = localStorage.getItem(
      SESSION_STORAGE_KEY,
    )

    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as RecruiterSession

    if (
      parsed &&
      typeof parsed.recruiter_id === 'number' &&
      typeof parsed.company_name === 'string'
    ) {
      return parsed
    }

    return null
  } catch {
    return null
  }
}

function formatNumber(
  value: number | null | undefined,
  decimals = 0,
) {
  if (value === null || value === undefined) {
    return '—'
  }

  const numeric = Number(value)

  if (!Number.isFinite(numeric)) {
    return '—'
  }

  return numeric.toFixed(decimals)
}

function toRpcFilters(
  f: Filters,
  recruiterId: number | null,
) {
  const skills = f.skill
    .map((skill) => skill.trim())
    .filter((skill) => skill.length > 0)

  const district = f.district.trim()

  const domains = f.domain
    .map((domain) => domain.trim())
    .filter((domain) => domain.length > 0)

  const minScoreText = f.minScore.trim()
  const minBadgesText = f.minBadges.trim()

  const minScore =
    minScoreText === ''
      ? null
      : Number(minScoreText)

  const minBadges =
    minBadgesText === ''
      ? null
      : Number(minBadgesText)

  return {
    p_skill: skills.length > 0 ? skills : null,

    p_district:
      district.length > 0 ? district : null,

    p_domain:
      domains.length > 0 ? domains : null,

    p_min_score:
      minScore !== null &&
      Number.isFinite(minScore)
        ? minScore
        : null,

    p_min_badges:
      minBadges !== null &&
      Number.isFinite(minBadges)
        ? Math.floor(minBadges)
        : null,

    p_limit: 50,

    p_recruiter_id:
      recruiterId ?? null,
  }
}

function isDuplicateKeyError(message: string) {
  const value = message.toLowerCase()

  return (
    value.includes('duplicate') ||
    value.includes('unique') ||
    value.includes('already') ||
    value.includes('23505')
  )
}

async function fetchExistingConnectStatus(
  recruiterId: number,
  studentId: number,
): Promise<ConnectStatus | null> {
  const tables = [
    'recruiter_connects',
  ]

  for (const table of tables) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('recruiter_id', recruiterId)
        .eq('student_id', studentId)
        .limit(1)

      if (error) {
        continue
      }

      if (!data || data.length === 0) {
        continue
      }

      const row = data[0] as Record<string, unknown>

      const rawStatus = String(
        row.status ??
          row.connection_status ??
          row.request_status ??
          '',
      ).toLowerCase()

      if (
        rawStatus.includes('accept') ||
        rawStatus.includes('approved')
      ) {
        return 'accepted'
      }

      if (
        rawStatus.includes('pending') ||
        rawStatus.includes('sent') ||
        rawStatus.includes('viewed')
      ) {
        return 'pending'
      }

      if (
        rawStatus.includes('reject') ||
        rawStatus.includes('declin')
      ) {
        return 'none'
      }

      return 'pending'
    } catch {
      continue
    }
  }

  return 'none'
}


function applyCandidateFilters(
  candidates: Candidate[],
  active: Filters,
) {
  const minScoreText = active.minScore.trim()
  const minBadgesText = active.minBadges.trim()

  const minScore =
    minScoreText === '' ? null : Number(minScoreText)

  const minBadges =
    minBadgesText === '' ? null : Number(minBadgesText)

  const selectedSkills = active.skill
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)

  const selectedDomains = active.domain
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)

  const district = active.district.trim().toLowerCase()

  return candidates.filter((candidate) => {
    const aiScore = Number(candidate.ai_test_score ?? 0)
    const badges = Number(candidate.badges_earned ?? 0)

    // These are intentionally applied in the UI as a second guard.
    // The search RPC also receives the same values.
    if (
      minScore !== null &&
      Number.isFinite(minScore) &&
      aiScore < minScore
    ) {
      return false
    }

    if (
      minBadges !== null &&
      Number.isFinite(minBadges) &&
      badges < Math.floor(minBadges)
    ) {
      return false
    }

    if (district) {
      const candidateDistrict = String(
        candidate.district ?? '',
      ).trim().toLowerCase()

      if (candidateDistrict !== district) {
        return false
      }
    }

    if (selectedSkills.length > 0) {
      const candidateSkills = (candidate.skills ?? []).map((item) =>
        String(item).trim().toLowerCase(),
      )

      const hasSkill = selectedSkills.every((selected) =>
        candidateSkills.some(
          (candidateSkill) =>
            candidateSkill === selected ||
            candidateSkill.includes(selected) ||
            selected.includes(candidateSkill),
        ),
      )

      if (!hasSkill) {
        return false
      }
    }

    if (selectedDomains.length > 0) {
      const candidateDomain = String(
        candidate.domain ?? '',
      ).trim().toLowerCase()

      const matchesDomain = selectedDomains.some(
        (selected) =>
          candidateDomain === selected ||
          candidateDomain.includes(selected) ||
          selected.includes(candidateDomain),
      )

      if (!matchesDomain) {
        return false
      }
    }

    return true
  })
}

function App() {
  const [candidates, setCandidates] =
    useState<Candidate[]>([])

  const [loading, setLoading] =
    useState(true)

  const [error, setError] =
    useState('')

  const [notice, setNotice] =
    useState('')

  const [filters, setFilters] =
    useState<Filters>(DEFAULT_FILTERS)

  const [skillOptions, setSkillOptions] =
    useState<string[]>(DEFAULT_SKILLS)

  const [domainOptions, setDomainOptions] =
    useState<string[]>(DEFAULT_DOMAINS)

  const [recruiter, setRecruiter] =
    useState<RecruiterSession | null>(
      () => loadStoredSession(),
    )

  const [loginRecruiterId, setLoginRecruiterId] =
    useState('')

  const [loginPassword, setLoginPassword] =
    useState('')

  const [authMode, setAuthMode] =
    useState<'login' | 'register'>('login')

  const [registerCompanyName, setRegisterCompanyName] =
    useState('')

  const [registerEmail, setRegisterEmail] =
    useState('')

  const [registerPassword, setRegisterPassword] =
    useState('')

  const [registerPhone, setRegisterPhone] =
    useState('')

  const [registerLocation, setRegisterLocation] =
    useState('')

  const [registerIndustry, setRegisterIndustry] =
    useState('')

  const [registerCompanyType, setRegisterCompanyType] =
    useState('')

  const [registerWebsite, setRegisterWebsite] =
    useState('')

  const [registerLoading, setRegisterLoading] =
    useState(false)

  const [registerError, setRegisterError] =
    useState('')

  const [registeredRecruiterId, setRegisteredRecruiterId] =
    useState<number | null>(null)

  const [showRegisterPassword, setShowRegisterPassword] =
    useState(false)

  const [loginLoading, setLoginLoading] =
    useState(false)

  const [loginError, setLoginError] =
    useState('')

  const [showLoginPassword, setShowLoginPassword] =
    useState(false)

  const [activePage, setActivePage] =
    useState<'search' | 'connections'>('search')

  const [connections, setConnections] =
    useState<Connection[]>([])

  const [connectionsLoading, setConnectionsLoading] =
    useState(false)

  const [connectionStatusFilter, setConnectionStatusFilter] =
    useState('All')

  const [selectedProof, setSelectedProof] =
    useState<CandidateProof | null>(null)

  const [proofLoading, setProofLoading] =
    useState(false)

  const [proofError, setProofError] =
    useState('')

  const [connectModalOpen, setConnectModalOpen] =
    useState(false)

  const [selectedConnectChallengeId, setSelectedConnectChallengeId] =
    useState('')

  const [selectedChallengeId, setSelectedChallengeId] =
    useState<number | null>(null)

  const [selectedChallenge, setSelectedChallenge] =
    useState<Challenge | null>(null)

  const [challenges, setChallenges] =
    useState<Challenge[]>([])

  const [challengesLoading, setChallengesLoading] =
    useState(false)

  const [challengesError, setChallengesError] =
    useState<string | null>(null)

  const [connectMessage, setConnectMessage] =
    useState(DEFAULT_CONNECT_MESSAGE)

  const [connectError, setConnectError] =
    useState('')

  const [sendingRequest, setSendingRequest] =
    useState(false)

  const [connectSuccess, setConnectSuccess] =
    useState<string | null>(null)

  const [existingStatus, setExistingStatus] =
    useState<ConnectStatus>('none')

  const [projectCandidates, setProjectCandidates] =
    useState<Candidate[]>([])

  const [checkingExisting, setCheckingExisting] =
    useState(false)

  const [sentStudentIds, setSentStudentIds] =
    useState<Set<number>>(() => {
      const session = loadStoredSession()

      return session
        ? loadPendingIdsFor(session.recruiter_id)
        : new Set()
    })

  const [settingsOpen, setSettingsOpen] =
    useState(false)

  const [settingsVisible, setSettingsVisible] =
    useState(false)

  const [theme, setTheme] =
    useState<Theme>(() => {
      return (
        (localStorage.getItem(
          'hirezone-theme',
        ) as Theme) || 'light'
      )
    })

  const [fontSize, setFontSize] =
    useState<FontSize>(() => {
      return (
        (localStorage.getItem(
          'hirezone-font-size',
        ) as FontSize) || 'medium'
      )
    })

  const [animationsEnabled, setAnimationsEnabled] =
    useState(() => {
      return (
        localStorage.getItem(
          'hirezone-animations',
        ) !== 'false'
      )
    })

  const settingsRef =
    useRef<HTMLDivElement>(null)

  const activeRecruiterId =
    recruiter?.recruiter_id ?? null

  const activeRecruiterCompany =
    recruiter?.company_name ?? ''

  const isAuthenticated =
    recruiter !== null

  const openSettings = () => {
    setSettingsVisible(true)
    setSettingsOpen(true)
  }

  const closeSettings = () => {
    setSettingsOpen(false)

    window.setTimeout(() => {
      setSettingsVisible(false)
    }, 200)
  }

  const loadRecruiterChallenges =
    async (recruiterId: number) => {
      setChallengesLoading(true)
      setChallengesError(null)

      try {
        const { data, error } =
          await supabase
            .from('sponsored_challenges')
            .select(`
              challenge_id,
              challenge_title,
              description,
              domain,
              difficulty_level,
              points_available,
              start_date,
              deadline,
              challenge_status,
              estimated_duration
            `)
            .eq('recruiter_id', recruiterId)
            .order('challenge_id')

        if (error) {
          throw error
        }

        setChallenges(
          (data ?? []) as Challenge[],
        )
      } catch (err) {
        console.error(err)

        setChallenges([])

        setChallengesError(
          'Failed to load your challenges.',
        )
      } finally {
        setChallengesLoading(false)
      }
    }

  const loadChallengeCandidates =
    async (challengeId: number) => {
      setLoading(true)
      setError('')
      setNotice('')

      try {
        const { data, error } =
          await supabase.rpc(
            'get_challenge_candidates',
            {
              p_challenge_id: challengeId,
            },
          )

        if (error) {
          throw error
        }

        const mappedCandidates: Candidate[] =
          (data ?? []).map(
            (row: Record<string, unknown>) => ({
              student_id: Number(
                row.student_id ?? 0,
              ),

              student_name: String(
                row.student_name ?? '',
              ),

              email: String(
                row.email ?? '',
              ),

              location: String(
                row.location ?? '',
              ),

              education: String(
                row.education ?? '',
              ),

              college_name: String(
                row.college ??
                  row.college_name ??
                  '',
              ),

              graduation_year: Number(
                row.graduation_year ?? 0,
              ),

              proof_id:
                row.proof_id == null
                  ? null
                  : Number(row.proof_id),

              project_name: String(
                row.project_name ?? '',
              ),

              domain: String(
                row.domain ?? '',
              ),

              skills: Array.isArray(row.skills)
                ? row.skills.map(String)
                : [],

              ai_test_score:
                row.ai_test_score == null
                  ? 0
                  : Number(
                      row.ai_test_score,
                    ),

              ai_test_passed: Boolean(
                row.ai_test_passed ?? false,
              ),

              badges_earned:
                row.badges_earned == null
                  ? 0
                  : Number(
                      row.badges_earned,
                    ),

              milestones_completed:
                row.milestones_completed == null
                  ? 0
                  : Number(
                      row.milestones_completed,
                    ),

              blog_posts_count: 0,

              district:
                row.district == null
                  ? ''
                  : String(row.district),

              relevance_score:
                row.relevance_score == null
                  ? 0
                  : Number(
                      row.relevance_score,
                    ),

              matched_challenges: 1,

              direct_projects:
                row.project_id
                  ? 1
                  : 0,

              match_type:
                'Challenge Project',
            }),
          )

        setProjectCandidates(
          mappedCandidates,
        )

        setCandidates(
          mappedCandidates,
        )

        setSelectedChallengeId(
          challengeId,
        )

        setNotice(
          `${mappedCandidates.length} candidates found for this challenge.`,
        )
      } catch (err) {
        console.error(
          'Failed to load challenge candidates:',
          err,
        )

        setError(
          err instanceof Error
            ? err.message
            : 'Failed to load challenge candidates.',
        )

        setProjectCandidates([])
        setCandidates([])
      } finally {
        setLoading(false)
      }
    }

const searchCandidates = useCallback(
    async (active: Filters) => {
      setLoading(true)
      setError('')
      setNotice('')

      try {
        const rpcFilters = toRpcFilters(
          active,
          activeRecruiterId,
        )

        console.log('SEARCH FILTERS:', rpcFilters)

        const { data, error: rpcError } =
          await supabase.rpc(
            'search_relevant_candidates',
            rpcFilters,
          )

        if (rpcError) {
          console.error('Search RPC error:', rpcError)
          setError(
            `Search failed: ${
              rpcError.message || JSON.stringify(rpcError)
            }`,
          )
          setCandidates([])
          return
        }

        console.log('SEARCH RPC RESULT:', data)

        const filteredCandidates = applyCandidateFilters(
          (data ?? []) as Candidate[],
          active,
        )

        console.log('FILTERED RESULT COUNT:', filteredCandidates.length)
        console.log('FILTERED RESULTS:', filteredCandidates)

        setCandidates(filteredCandidates)

        if (filteredCandidates.length === 0) {
          setNotice('No candidates match the selected filters.')
        } else {
          setNotice(
            `${filteredCandidates.length} candidate${
              filteredCandidates.length === 1 ? '' : 's'
            } found.`,
          )
        }
      } catch (err) {
        console.error('Candidate search failed:', err)

        setError(
          `Search failed: ${
            err instanceof Error ? err.message : JSON.stringify(err)
          }`,
        )

        setCandidates([])
      } finally {
        setLoading(false)
      }
    },
    [activeRecruiterId],
  )

  const loadConnections =
    async () => {
      if (
        activeRecruiterId === null
      ) {
        setConnections([])
        return
      }

      setConnectionsLoading(true)

      try {
        const { data, error } =
          await supabase.rpc(
            'get_recruiter_connections',
            {
              p_recruiter_id:
                activeRecruiterId,
            },
          )

        if (error) {
          throw error
        }

        setConnections(
          Array.isArray(data)
            ? (data as Connection[])
            : [],
        )
      } catch (err) {
        console.error(
          'Failed to load connections:',
          err,
        )

        setConnections([])
      } finally {
        setConnectionsLoading(false)
      }
    }

  useEffect(() => {
    document.documentElement.setAttribute(
      'data-theme',
      theme,
    )

    localStorage.setItem(
      'hirezone-theme',
      theme,
    )
  }, [theme])

  useEffect(() => {
    document.documentElement.setAttribute(
      'data-font-size',
      fontSize,
    )

    localStorage.setItem(
      'hirezone-font-size',
      fontSize,
    )
  }, [fontSize])

  useEffect(() => {
    document.documentElement.setAttribute(
      'data-animations',
      animationsEnabled
        ? 'enabled'
        : 'disabled',
    )

    localStorage.setItem(
      'hirezone-animations',
      String(animationsEnabled),
    )
  }, [animationsEnabled])

  useEffect(() => {
    if (!isAuthenticated) {
      return
    }

    void searchCandidates(
      DEFAULT_FILTERS,
    )
  }, [
    isAuthenticated,
    searchCandidates,
  ])

  useEffect(() => {
    if (
      activeRecruiterId === null
    ) {
      return
    }

    persistPendingIdsFor(
      activeRecruiterId,
      sentStudentIds,
    )
  }, [
    activeRecruiterId,
    sentStudentIds,
  ])

  useEffect(() => {
    if (
      activeRecruiterId !== null
    ) {
      void loadRecruiterChallenges(
        activeRecruiterId,
      )
    }
  }, [activeRecruiterId])

  useEffect(() => {
    if (
      !selectedProof ||
      activeRecruiterId === null
    ) {
      setCheckingExisting(false)
      setExistingStatus('none')
      return
    }

    let cancelled = false

    setCheckingExisting(true)

    void fetchExistingConnectStatus(
      activeRecruiterId,
      selectedProof.student_id,
    )
      .then((status) => {
        if (cancelled) {
          return
        }

        const resolved =
          status ?? 'none'

        setExistingStatus(
          resolved,
        )

        if (
          resolved === 'pending' ||
          resolved === 'accepted'
        ) {
          setSentStudentIds(
            (previous) =>
              new Set(
                previous,
              ).add(
                selectedProof.student_id,
              ),
          )
        }

        if (resolved === 'none') {
          setSentStudentIds(
            (previous) => {
              const next =
                new Set(previous)

              next.delete(
                selectedProof.student_id,
              )

              return next
            },
          )
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCheckingExisting(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [
    selectedProof,
    activeRecruiterId,
  ])

  useEffect(() => {
    const onKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (event.key !== 'Escape') {
        return
      }

      if (
        connectSuccess !== null
      ) {
        setConnectSuccess(null)
        return
      }

      if (connectModalOpen) {
        setConnectModalOpen(false)
        return
      }

      if (
        selectedProof &&
        !proofLoading
      ) {
        setSelectedProof(null)
      }
    }

    document.addEventListener(
      'keydown',
      onKeyDown,
    )

    return () => {
      document.removeEventListener(
        'keydown',
        onKeyDown,
      )
    }
  }, [
    connectSuccess,
    connectModalOpen,
    selectedProof,
    proofLoading,
  ])

  useEffect(() => {
    const handleOutsideClick =
      (event: MouseEvent) => {
        if (
          settingsVisible &&
          settingsRef.current &&
          !settingsRef.current.contains(
            event.target as Node,
          )
        ) {
          closeSettings()
        }
      }

    document.addEventListener(
      'mousedown',
      handleOutsideClick,
    )

    return () => {
      document.removeEventListener(
        'mousedown',
        handleOutsideClick,
      )
    }
  }, [settingsVisible])

  const handleLogin =
    async (event?: FormEvent) => {
      event?.preventDefault()

      const recruiterId =
        Number(
          loginRecruiterId.trim(),
        )

      if (
        !loginRecruiterId.trim() ||
        !loginPassword
      ) {
        setLoginError(
          'Please enter Recruiter ID and password.',
        )

        return
      }

      if (
        !Number.isFinite(recruiterId)
      ) {
        setLoginError(
          'Recruiter ID must be a number.',
        )

        return
      }

      setLoginLoading(true)
      setLoginError('')

      try {
        const {
          data,
          error,
        } = await (
          supabase as any
        ).rpc(
          'verify_recruiter_login',
          {
            p_recruiter_id:
              recruiterId,

            p_password:
              loginPassword,
          },
        )

        if (error) {
          throw error
        }

        const row =
          Array.isArray(data)
            ? data[0]
            : data

        if (
          !row ||
          row.recruiter_id == null
        ) {
          throw new Error(
            'Invalid recruiter ID or password.',
          )
        }

        const session: RecruiterSession =
          {
            recruiter_id:
              Number(
                row.recruiter_id,
              ),

            company_name:
              String(
                row.company_name,
              ),

            email:
              row.email ?? null,
          }

        localStorage.setItem(
          SESSION_STORAGE_KEY,
          JSON.stringify(
            session,
          ),
        )

        setRecruiter(session)

        setSentStudentIds(
          loadPendingIdsFor(
            session.recruiter_id,
          ),
        )

        setLoginPassword('')
      } catch (err) {
        setLoginError(
          err instanceof Error
            ? err.message
            : 'Invalid recruiter ID or password.',
        )
      } finally {
        setLoginLoading(false)
      }
    }

  const handleRegister =
    async (event: FormEvent) => {
      event.preventDefault()

      if (
        !registerCompanyName.trim() ||
        !registerEmail.trim() ||
        !registerPassword
      ) {
        setRegisterError(
          'Company name, email and password are required.',
        )

        return
      }

      if (
        registerPassword.length < 6
      ) {
        setRegisterError(
          'Password must be at least 6 characters.',
        )

        return
      }

      setRegisterLoading(true)
      setRegisterError('')
      setRegisteredRecruiterId(null)

      try {
        const {
          data,
          error,
        } = await (
          supabase as any
        ).rpc(
          'register_recruiter',
          {
            p_company_name:
              registerCompanyName.trim(),

            p_email:
              registerEmail.trim(),

            p_password:
              registerPassword,

            p_phone:
              registerPhone.trim() ||
              null,

            p_location:
              registerLocation.trim() ||
              null,

            p_industry:
              registerIndustry.trim() ||
              null,

            p_company_type:
              registerCompanyType ||
              null,

            p_website:
              registerWebsite.trim() ||
              null,
          },
        )

        if (error) {
          throw new Error(
            error.message ||
              'Unable to register company.',
          )
        }

        const row =
          Array.isArray(data)
            ? data[0]
            : data

        if (
          !row ||
          row.recruiter_id == null
        ) {
          throw new Error(
            'Registration completed but no Recruiter ID was returned.',
          )
        }

        setRegisteredRecruiterId(
          Number(
            row.recruiter_id,
          ),
        )

        setLoginRecruiterId(
          String(
            row.recruiter_id,
          ),
        )

        setRegisterPassword('')
      } catch (err) {
        setRegisterError(
          err instanceof Error
            ? err.message
            : 'Unable to register company.',
        )
      } finally {
        setRegisterLoading(false)
      }
    }

  const handleLogout = () => {
    localStorage.removeItem(
      SESSION_STORAGE_KEY,
    )

    setRecruiter(null)
    setConnections([])
    setChallenges([])
    setCandidates([])
    setProjectCandidates([])
    setSelectedChallengeId(null)
    setSelectedChallenge(null)
    setSentStudentIds(new Set())
    setActivePage('search')
  }

  const handleSearch = () => {
    if (
      selectedChallengeId !== null
    ) {
      void loadChallengeCandidates(
        selectedChallengeId,
      )

      return
    }

    void searchCandidates(
      filters,
    )
  }

  const clearFilters = () => {
    setFilters(
      DEFAULT_FILTERS,
    )

    setSelectedChallengeId(
      null,
    )

    setSelectedChallenge(
      null,
    )

    setProjectCandidates([])

    void searchCandidates(
      DEFAULT_FILTERS,
    )
  }

  const loadCandidateProof =
    async (studentId: number) => {
      console.log(
        'Opening proof for student:',
        studentId,
      )

      setProofLoading(true)
      setProofError('')
      setSelectedProof(null)

      try {
        const {
          data,
          error,
        } = await supabase.rpc(
          'get_candidate_proof',
          {
            p_student_id:
              studentId,
          },
        )

        console.log(
          'Proof RPC response:',
          { data, error },
        )

        if (error) {
          throw new Error(
            error.message,
          )
        }

        if (
          !data ||
          !Array.isArray(data) ||
          data.length === 0
        ) {
          throw new Error(
            'No proof-of-work record found for this candidate.',
          )
        }

        const row = data[0]

        const {
          data: githubRepos,
          error: githubError,
        } = await supabase.rpc(
          'get_candidate_github_repos',
          {
            p_student_id:
              studentId,
          },
        )

        if (githubError) {
          console.warn(
            'Failed to load GitHub repositories:',
            githubError,
          )
        }

        const proofProjectName =
          row.project_name
            ?.trim()
            .toLowerCase() || ''

        const matchingRepository =
          Array.isArray(githubRepos)
            ? githubRepos.find(
                (repo: {
                  project_name?: string | null
                  github_url?: string | null
                }) =>
                  repo.project_name
                    ?.trim()
                    .toLowerCase() ===
                    proofProjectName &&
                  typeof repo.github_url ===
                    'string' &&
                  repo.github_url.trim() !== '',
              )
            : null

        console.log(
          'Proof project:',
          row.project_name,
        )

        console.log(
          'Matching GitHub repository:',
          matchingRepository,
        )

        setSelectedProof({
          student_id: Number(
            row.student_id,
          ),

          student_name:
            row.student_name ?? '',

          email:
            row.email ?? '',

          phone:
            row.phone ?? null,

          location:
            row.location ?? '',

          education:
            row.education ?? '',

          college_name:
            row.college_name ?? '',

          graduation_year:
            row.graduation_year !== null &&
            row.graduation_year !== undefined
              ? Number(
                  row.graduation_year,
                )
              : null,

          proof_id:
            row.proof_id !== null &&
            row.proof_id !== undefined
              ? Number(
                  row.proof_id,
                )
              : null,

          project_name:
            row.project_name ?? '',

          domain:
            row.domain ?? '',

          skills:
            Array.isArray(row.skills)
              ? row.skills
              : [],

          milestones_completed:
            row.milestones_completed !==
              null &&
            row.milestones_completed !==
              undefined
              ? Number(
                  row.milestones_completed,
                )
              : 0,

          ai_test_score:
            row.ai_test_score !== null &&
            row.ai_test_score !== undefined
              ? Number(
                  row.ai_test_score,
                )
              : null,

          ai_test_passed:
            row.ai_test_passed !== null &&
            row.ai_test_passed !== undefined
              ? Boolean(
                  row.ai_test_passed,
                )
              : false,

          blog_posts_count:
            row.blog_posts_count !==
              null &&
            row.blog_posts_count !==
              undefined
              ? Number(
                  row.blog_posts_count,
                )
              : 0,

          badges_earned:
            row.badges_earned !== null &&
            row.badges_earned !== undefined
              ? Number(
                  row.badges_earned,
                )
              : 0,

          profile_score:
            row.profile_score !== null &&
            row.profile_score !== undefined
              ? Number(
                  row.profile_score,
                )
              : null,

          last_updated:
            row.last_updated ?? null,

          github_url:
            matchingRepository?.github_url
              ?.trim() ?? null,

          github_repos:
            matchingRepository
              ? [
                  {
                    project_name:
                      matchingRepository.project_name
                        ?.trim() ||
                      row.project_name ||
                      'Student Project',

                    github_url:
                      matchingRepository.github_url!.trim(),

                    live_demo_url:
                      matchingRepository.live_demo_url
                        ?.trim() ||
                      null,
                  },
                ]
              : [],
        })

        console.log(
          'Proof loaded successfully:',
          row,
        )
      } catch (error) {
        console.error(
          'Failed to load candidate proof:',
          error,
        )

        setProofError(
          error instanceof Error
            ? error.message
            : 'Failed to load candidate proof.',
        )
      } finally {
        setProofLoading(false)
      }
    }

  const openConnectModal = () => {
    if (!selectedProof) {
      return
    }

    if (
      sentStudentIds.has(
        selectedProof.student_id,
      )
    ) {
      setProofError(
        'A request already exists for this candidate.',
      )

      return
    }

    if (
      existingStatus === 'pending' ||
      existingStatus === 'accepted'
    ) {
      setProofError(
        'A request already exists for this candidate.',
      )

      return
    }

    setConnectError('')
    setSelectedConnectChallengeId('')
    setConnectMessage(
      DEFAULT_CONNECT_MESSAGE,
    )

    setConnectModalOpen(true)
  }

  const sendConnectionRequest =
    async () => {
      if (
        !selectedProof ||
        activeRecruiterId === null
      ) {
        return
      }

      if (
        !connectMessage.trim()
      ) {
        setConnectError(
          'Please enter a message.',
        )

        return
      }

      setSendingRequest(true)
      setConnectError('')

      try {
        const { error } =
          await supabase.rpc(
            'create_recruiter_connect',
            {
              p_recruiter_id:
                activeRecruiterId,

              p_student_id:
                selectedProof.student_id,

              p_challenge_id:
                selectedConnectChallengeId
                  ? Number(
                      selectedConnectChallengeId,
                    )
                  : null,

              p_message:
                connectMessage.trim(),
            },
          )

        if (error) {
          if (
            isDuplicateKeyError(
              error.message,
            )
          ) {
            setConnectError(
              'A request already exists for this candidate.',
            )

            return
          }

          throw error
        }

        const studentId =
          selectedProof.student_id

        const studentName =
          selectedProof.student_name

        setSentStudentIds(
          (previous) =>
            new Set(
              previous,
            ).add(studentId),
        )

        setExistingStatus(
          'pending',
        )

        setConnectModalOpen(false)

        setConnectSuccess(
          studentName,
        )

        setNotice(
          `Connection request sent to ${studentName}!`,
        )
      } catch (err) {
        setConnectError(
          err instanceof Error
            ? err.message
            : 'Failed to send request.',
        )
      } finally {
        setSendingRequest(false)
      }
    }

  const filteredConnections =
    connections.filter(
      (connection) =>
        connectionStatusFilter ===
          'All' ||
        connection.status ===
          connectionStatusFilter,
    )


  const totalAccepted = connections.filter(
    (item) => item.status === 'Accepted',
  ).length

  const totalPending = connections.filter(
    (item) =>
      item.status === 'Sent' ||
      item.status === 'Viewed',
  ).length

  const averageMatchScore =
    candidates.length > 0
      ? Math.round(
          candidates.reduce(
            (sum, candidate) =>
              sum + Number(candidate.relevance_score ?? 0),
            0,
          ) / candidates.length,
        )
      : 0

  if (!isAuthenticated) {
    return (
      <div className="app site-background">
        <div className="ambient-grid" />

        <header className="public-header">
          <div className="brand-lockup">
            <span className="brand-mark">H</span>
            <span className="brand-name">hirezone</span>
          </div>

          <nav className="public-nav" aria-label="Main navigation">
            <a href="#discover">Discover talent</a>
            <a href="#proof">Proof of work</a>
            <a href="#companies">For companies</a>
            <a href="#guide">Guide</a>
          </nav>

          <div className="public-actions">
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setAuthMode('login')
                setLoginError('')
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              className="dark-pill-button"
              onClick={() => {
                setAuthMode('register')
                setRegisterError('')
              }}
            >
              Register company <span>→</span>
            </button>
          </div>
        </header>

        <main className="auth-main">
          <div className="auth-copy">
            <p className="eyebrow">INDUSTRY TALENT DISCOVERY</p>
            <h1>
              Meet the people
              <br />
              who can <em>build it.</em>
            </h1>
            <p className="auth-description">
              Hirezone helps recruiters discover verified student talent
              through skills, projects, challenges and proof of work.
            </p>

            <div className="auth-proof-row">
              <span>Verified profiles</span>
              <span>•</span>
              <span>Project evidence</span>
              <span>•</span>
              <span>Challenge matching</span>
            </div>
          </div>

          <div className="auth-card">
            <div className="auth-card-top">
              <div>
                <span className="small-kicker">
                  {authMode === 'login' ? 'RECRUITER ACCESS' : 'NEW COMPANY'}
                </span>
                <h2>
                  {authMode === 'login'
                    ? 'Welcome back.'
                    : 'Create your company account.'}
                </h2>
              </div>
              <span className="auth-card-dot" />
            </div>

            <div className="auth-tabs">
              <button
                type="button"
                className={authMode === 'login' ? 'auth-tab active' : 'auth-tab'}
                onClick={() => {
                  setAuthMode('login')
                  setRegisterError('')
                  setRegisteredRecruiterId(null)
                }}
              >
                Sign in
              </button>
              <button
                type="button"
                className={authMode === 'register' ? 'auth-tab active' : 'auth-tab'}
                onClick={() => {
                  setAuthMode('register')
                  setLoginError('')
                }}
              >
                Register
              </button>
            </div>

            {authMode === 'login' ? (
              <form className="clean-form" onSubmit={handleLogin}>
                <label>
                  Recruiter ID
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="e.g. 104"
                    value={loginRecruiterId}
                    onChange={(event) =>
                      setLoginRecruiterId(event.target.value)
                    }
                  />
                </label>

                <label>
                  Password
                  <div className="input-with-action">
                    <input
                      type={showLoginPassword ? 'text' : 'password'}
                      placeholder="Enter password"
                      value={loginPassword}
                      onChange={(event) =>
                        setLoginPassword(event.target.value)
                      }
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowLoginPassword((value) => !value)
                      }
                    >
                      {showLoginPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>

                {loginError && (
                  <div className="form-error">{loginError}</div>
                )}

                <button
                  type="submit"
                  className="primary-submit"
                  disabled={loginLoading}
                >
                  {loginLoading ? 'Signing in…' : 'Continue'} <span>→</span>
                </button>
              </form>
            ) : (
              <form className="clean-form register-form-grid" onSubmit={handleRegister}>
                <label>
                  Company name *
                  <input
                    type="text"
                    placeholder="Your company"
                    value={registerCompanyName}
                    onChange={(event) =>
                      setRegisterCompanyName(event.target.value)
                    }
                  />
                </label>

                <label>
                  Email *
                  <input
                    type="email"
                    placeholder="company@example.com"
                    value={registerEmail}
                    onChange={(event) =>
                      setRegisterEmail(event.target.value)
                    }
                    autoComplete="email"
                  />
                </label>

                <label>
                  Password *
                  <div className="input-with-action">
                    <input
                      type={showRegisterPassword ? 'text' : 'password'}
                      placeholder="Minimum 6 characters"
                      value={registerPassword}
                      onChange={(event) =>
                        setRegisterPassword(event.target.value)
                      }
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowRegisterPassword((value) => !value)
                      }
                    >
                      {showRegisterPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>

                <label>
                  Phone
                  <input
                    type="tel"
                    placeholder="+91…"
                    value={registerPhone}
                    onChange={(event) =>
                      setRegisterPhone(event.target.value)
                    }
                  />
                </label>

                <label>
                  Location
                  <input
                    type="text"
                    placeholder="e.g. Bengaluru"
                    value={registerLocation}
                    onChange={(event) =>
                      setRegisterLocation(event.target.value)
                    }
                  />
                </label>

                <label>
                  Industry
                  <input
                    type="text"
                    placeholder="Technology"
                    value={registerIndustry}
                    onChange={(event) =>
                      setRegisterIndustry(event.target.value)
                    }
                  />
                </label>

                <label>
                  Company type
                  <select
                    value={registerCompanyType}
                    onChange={(event) =>
                      setRegisterCompanyType(event.target.value)
                    }
                  >
                    <option value="">Select type</option>
                    <option value="Startup">Startup</option>
                    <option value="SME">SME</option>
                    <option value="Enterprise">Enterprise</option>
                  </select>
                </label>

                <label>
                  Website
                  <input
                    type="url"
                    placeholder="https://…"
                    value={registerWebsite}
                    onChange={(event) =>
                      setRegisterWebsite(event.target.value)
                    }
                  />
                </label>

                {registerError && (
                  <div className="form-error form-span-2">
                    {registerError}
                  </div>
                )}

                {registeredRecruiterId !== null && (
                  <div className="registration-success form-span-2">
                    <strong>Account created.</strong>
                    <span>
                      Recruiter ID: <b>{registeredRecruiterId}</b>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('login')
                        setRegisteredRecruiterId(null)
                      }}
                    >
                      Continue to sign in →
                    </button>
                  </div>
                )}

                <button
                  type="submit"
                  className="primary-submit form-span-2"
                  disabled={registerLoading}
                >
                  {registerLoading ? 'Creating account…' : 'Create account'}{' '}
                  <span>→</span>
                </button>
              </form>
            )}

            <p className="auth-footnote">
              Recruiter access is connected to your Hirezone company account.
            </p>
          </div>
        </main>

        <section className="auth-highlight-band">
          <div>
            <strong>01</strong>
            <span>Find verified talent</span>
          </div>
          <div>
            <strong>02</strong>
            <span>Inspect proof of work</span>
          </div>
          <div>
            <strong>03</strong>
            <span>Connect directly</span>
          </div>
          <div>
            <strong>04</strong>
            <span>Track every request</span>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="app site-background">
      <div className="ambient-grid" />

      <header className="app-header">
        <div className="brand-lockup">
          <span className="brand-mark">H</span>
          <span className="brand-name">hirezone</span>
        </div>

        <nav className="main-nav" aria-label="Recruiter navigation">
          <button
            type="button"
            className={activePage === 'search' ? 'main-nav-link active' : 'main-nav-link'}
            onClick={() => setActivePage('search')}
          >
            Discover talent
          </button>
          <button
            type="button"
            className={
              activePage === 'connections'
                ? 'main-nav-link active'
                : 'main-nav-link'
            }
            onClick={() => {
              setActivePage('connections')
              void loadConnections()
            }}
          >
            My connections
            {totalPending > 0 && (
              <span className="nav-badge">{totalPending}</span>
            )}
          </button>
        </nav>

        <div className="header-right">
          <div className="company-chip">
            <span className="company-avatar">
              {activeRecruiterCompany.charAt(0).toUpperCase()}
            </span>
            <span>
              <small>Recruiter #{activeRecruiterId}</small>
              <strong>{activeRecruiterCompany}</strong>
            </span>
          </div>

          <button
            type="button"
            className="icon-button"
            onClick={() => {
              if (settingsOpen) closeSettings()
              else openSettings()
            }}
            aria-label="Open settings"
          >
            ⚙
          </button>

          <button
            type="button"
            className="logout-link"
            onClick={handleLogout}
          >
            Log out
          </button>

          {settingsVisible && (
            <div
              className={`settings-popover ${
                settingsOpen ? 'settings-popover-open' : 'settings-popover-closing'
              }`}
              ref={settingsRef}
            >
              <div className="settings-popover-title">
                <span>Preferences</span>
                <button type="button" onClick={closeSettings}>×</button>
              </div>

              <div className="settings-row">
                <span>Theme</span>
                <div className="segmented">
                  <button
                    type="button"
                    className={theme === 'light' ? 'selected' : ''}
                    onClick={() => setTheme('light')}
                  >
                    Light
                  </button>
                  <button
                    type="button"
                    className={theme === 'dark' ? 'selected' : ''}
                    onClick={() => setTheme('dark')}
                  >
                    Dark
                  </button>
                </div>
              </div>

              <div className="settings-row">
                <span>Text size</span>
                <div className="segmented">
                  {(['small', 'medium', 'large'] as FontSize[]).map((size) => (
                    <button
                      type="button"
                      key={size}
                      className={fontSize === size ? 'selected' : ''}
                      onClick={() => setFontSize(size)}
                    >
                      {size[0].toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                className="settings-toggle"
                onClick={() => setAnimationsEnabled((value) => !value)}
              >
                <span>Motion</span>
                <b>{animationsEnabled ? 'On' : 'Off'}</b>
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="page">
        {activePage === 'search' ? (
          <>
            <section className="hero-section" id="discover">
              <div className="gradient-ribbon ribbon-one" />
              <div className="gradient-ribbon ribbon-two" />

              <div className="hero-copy">
                <p className="eyebrow">RECRUITER WORKSPACE / 2026</p>
                <h1>
                  Discover
                  <br />
                  <em>exceptional</em> talent.
                </h1>
                <p className="hero-description">
                  Search verified student profiles by capability, location,
                  domain, AI score and proof of work.
                </p>

                <div className="hero-meta">
                  <span>
                    <b>{candidates.length}</b> visible candidates
                  </span>
                  <span>•</span>
                  <span>Average match <b>{averageMatchScore}</b></span>
                </div>
              </div>

              <div className="hero-feature-card">
                <div className="feature-label">HIREZONE SIGNAL</div>
                <div className="feature-number">{averageMatchScore || '—'}</div>
                <div className="feature-title">average match signal</div>
                <p>
                  Candidate discovery combines profile evidence, skills,
                  projects and challenge relevance.
                </p>
                <div className="feature-line">
                  <span>Talent intelligence</span>
                  <span>↗</span>
                </div>
              </div>
            </section>

            <section className="filter-section">
              <div className="section-heading">
                <div>
                  <span className="section-kicker">SEARCH</span>
                  <h2>Find the right profile.</h2>
                </div>
                <button
                  type="button"
                  className="plain-action"
                  onClick={clearFilters}
                >
                  Reset all filters ↗
                </button>
              </div>

              <div className="filter-panel">
                <div className="filter-field wide">
                  <label>Challenge</label>
                  <select
                    value={
                      selectedChallengeId
                        ? String(selectedChallengeId)
                        : ''
                    }
                    onChange={(event) => {
                      const value = event.target.value

                      if (!value) {
                        setSelectedChallengeId(null)
                        setSelectedChallenge(null)
                        setProjectCandidates([])
                        void searchCandidates(filters)
                        return
                      }

                      const challengeId = Number(value)
                      const challenge =
                        challenges.find(
                          (item) => item.challenge_id === challengeId,
                        ) ?? null

                      setSelectedChallenge(challenge)
                      void loadChallengeCandidates(challengeId)
                    }}
                  >
                    <option value="">All candidates</option>
                    {challenges.map((challenge) => (
                      <option
                        key={challenge.challenge_id}
                        value={challenge.challenge_id}
                      >
                        {challenge.challenge_title}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="filter-field">
                  <label>Skill</label>
                  <select
                    value=""
                    onChange={(event) => {
                      const selectedSkill = event.target.value
                      if (
                        selectedSkill &&
                        !filters.skill.includes(selectedSkill)
                      ) {
                        setFilters((previous) => ({
                          ...previous,
                          skill: [...previous.skill, selectedSkill],
                        }))
                      }
                    }}
                  >
                    <option value="">Add skill</option>
                    {skillOptions.map((skill) => (
                      <option key={skill} value={skill}>
                        {skill}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="filter-field">
                  <label>Domain</label>
                  <select
                    value=""
                    onChange={(event) => {
                      const selectedDomain = event.target.value
                      if (
                        selectedDomain &&
                        !filters.domain.includes(selectedDomain)
                      ) {
                        setFilters((previous) => ({
                          ...previous,
                          domain: [...previous.domain, selectedDomain],
                        }))
                      }
                    }}
                  >
                    <option value="">Add domain</option>
                    {domainOptions.map((domain) => (
                      <option key={domain} value={domain}>
                        {domain}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="filter-field">
                  <label>District</label>
                  <select
                    value={filters.district}
                    onChange={(event) =>
                      setFilters((previous) => ({
                        ...previous,
                        district: event.target.value,
                      }))
                    }
                  >
                    <option value="">All districts</option>
                    <option value="Mumbai City">Mumbai City</option>
                    <option value="Mumbai Suburban">Mumbai Suburban</option>
                    <option value="Pune">Pune</option>
                    <option value="Thane">Thane</option>
                    <option value="Nagpur">Nagpur</option>
                    <option value="Nashik">Nashik</option>
                    <option value="Chhatrapati Sambhajinagar">
                      Chhatrapati Sambhajinagar
                    </option>
                    <option value="Solapur">Solapur</option>
                    <option value="Kolhapur">Kolhapur</option>
                    <option value="Satara">Satara</option>
                    <option value="Sangli">Sangli</option>
                    <option value="Ahmednagar">Ahmednagar</option>
                  </select>
                </div>

                <div className="filter-field">
                  <label>Minimum AI score</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    placeholder="e.g. 70"
                    value={filters.minScore}
                    onChange={(event) =>
                      setFilters((previous) => ({
                        ...previous,
                        minScore: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="filter-field">
                  <label>Minimum badges</label>
                  <input
                    type="number"
                    min={0}
                    placeholder="e.g. 3"
                    value={filters.minBadges}
                    onChange={(event) =>
                      setFilters((previous) => ({
                        ...previous,
                        minBadges: event.target.value,
                      }))
                    }
                  />
                </div>

                <button
                  type="button"
                  className="search-submit"
                  onClick={handleSearch}
                  disabled={loading}
                >
                  {loading ? 'Searching…' : 'Search candidates'} <span>→</span>
                </button>

                {(filters.skill.length > 0 || filters.domain.length > 0) && (
                  <div className="active-filter-row">
                    {filters.skill.map((skill) => (
                      <button
                        type="button"
                        className="filter-pill"
                        key={skill}
                        onClick={() =>
                          setFilters((previous) => ({
                            ...previous,
                            skill: previous.skill.filter(
                              (item) => item !== skill,
                            ),
                          }))
                        }
                      >
                        {skill} ×
                      </button>
                    ))}
                    {filters.domain.map((domain) => (
                      <button
                        type="button"
                        className="filter-pill"
                        key={domain}
                        onClick={() =>
                          setFilters((previous) => ({
                            ...previous,
                            domain: previous.domain.filter(
                              (item) => item !== domain,
                            ),
                          }))
                        }
                      >
                        {domain} ×
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="highlights-section" id="proof">
              <div className="section-heading compact">
                <div>
                  <span className="section-kicker">RECENT HIGHLIGHTS</span>
                  <h2>Signals worth exploring.</h2>
                </div>
              </div>

              <div className="highlight-track">
                <article className="highlight-card cyan">
                  <span>01 / VERIFIED</span>
                  <h3>Proof-first profiles</h3>
                  <p>
                    Inspect projects, skills and repository evidence before
                    starting a conversation.
                  </p>
                  <b>Explore profiles →</b>
                </article>
                <article className="highlight-card blue">
                  <span>02 / MATCHING</span>
                  <h3>Challenge relevance</h3>
                  <p>
                    See candidates connected to the challenges your company
                    publishes.
                  </p>
                  <b>Open challenges →</b>
                </article>
                <article className="highlight-card violet">
                  <span>03 / SIGNAL</span>
                  <h3>AI score + badges</h3>
                  <p>
                    Set minimum thresholds and keep low-signal profiles out of
                    the result set.
                  </p>
                  <b>Set thresholds →</b>
                </article>
                <article className="highlight-card ink">
                  <span>04 / RELATIONSHIPS</span>
                  <h3>Direct connections</h3>
                  <p>
                    Send a targeted request and track its status from one
                    recruiter workspace.
                  </p>
                  <b>View connections →</b>
                </article>
              </div>
            </section>

            {notice && (
              <div className="inline-notice">
                <span>●</span> {notice}
              </div>
            )}

            {error && (
              <div className="inline-error large-error">
                {error}
              </div>
            )}

            <section className="results-section">
              <div className="section-heading">
                <div>
                  <span className="section-kicker">CANDIDATE INDEX</span>
                  <h2>Candidate results.</h2>
                </div>
                <span className="result-count">
                  {candidates.length} profiles
                </span>
              </div>

              {loading ? (
                <div className="empty-state loading-state">
                  <div className="loader" />
                  <h3>Finding relevant profiles…</h3>
                  <p>Applying your search signals.</p>
                </div>
              ) : candidates.length === 0 ? (
                <div className="empty-state">
                  <span className="empty-icon">○</span>
                  <h3>No matching candidates.</h3>
                  <p>
                    Try removing a threshold or changing your search
                    criteria.
                  </p>
                  <button type="button" className="dark-pill-button" onClick={clearFilters}>
                    Reset filters →
                  </button>
                </div>
              ) : (
                <div className="candidate-grid">
                  {candidates.map((candidate, index) => (
                    <article
                      className="candidate-card-new"
                      key={`${candidate.student_id}-${candidate.project_name}-${index}`}
                    >
                      <div className="candidate-card-header">
                        <div className="candidate-identity">
                          <div className="large-avatar">
                            {candidate.student_name?.charAt(0) ?? '?'}
                          </div>
                          <div>
                            <span className="card-index">
                              PROFILE / {String(index + 1).padStart(2, '0')}
                            </span>
                            <h3>{candidate.student_name}</h3>
                            <p>
                              {candidate.location || candidate.district || 'Location not listed'}
                            </p>
                          </div>
                        </div>

                        <div className="match-block">
                          <span>Match</span>
                          <strong>
                            {formatNumber(candidate.relevance_score)}
                          </strong>
                        </div>
                      </div>

                      <div className="candidate-card-body">
                        <div className="candidate-context">
                          <span>EDUCATION</span>
                          <strong>{candidate.college_name || '—'}</strong>
                          <p>{candidate.education || '—'}</p>
                        </div>

                        <div className="candidate-context">
                          <span>PROJECT</span>
                          <strong>{candidate.project_name || '—'}</strong>
                          <p>{candidate.domain || '—'}</p>
                        </div>
                      </div>

                      <div className="candidate-tags">
                        {(candidate.skills ?? []).slice(0, 5).map((skill) => (
                          <span key={`${candidate.student_id}-${skill}`}>
                            {skill}
                          </span>
                        ))}
                      </div>

                      <div className="candidate-metrics">
                        <div>
                          <span>AI score</span>
                          <strong>{formatNumber(candidate.ai_test_score)}</strong>
                        </div>
                        <div>
                          <span>Badges</span>
                          <strong>{formatNumber(candidate.badges_earned)}</strong>
                        </div>
                        <div>
                          <span>Challenges</span>
                          <strong>{formatNumber(candidate.matched_challenges)}</strong>
                        </div>
                        <div>
                          <span>District</span>
                          <strong>{candidate.district || '—'}</strong>
                        </div>
                      </div>

                      {Number(candidate.matched_challenges ?? 0) > 0 && (
                        <div className="challenge-line">
                          <span>↗</span>
                          Matches {candidate.matched_challenges} recruiter challenge
                          {Number(candidate.matched_challenges ?? 0) > 1 ? 's' : ''}
                        </div>
                      )}

                      <div className="candidate-card-footer">
                        <button
                          type="button"
                          className="outline-action"
                          onClick={() =>
                            void loadCandidateProof(candidate.student_id)
                          }
                          disabled={proofLoading}
                        >
                          View proof of work <span>→</span>
                        </button>

                        {sentStudentIds.has(candidate.student_id) && (
                          <span className="pending-chip">
                            Request pending ✓
                          </span>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : (
          <section className="connections-section" id="companies">
            <div className="connections-hero">
              <div>
                <span className="section-kicker">RELATIONSHIP DESK</span>
                <h1>My connections.</h1>
                <p>
                  Track every candidate request from first message to
                  accepted connection.
                </p>
              </div>
              <button
                type="button"
                className="dark-pill-button"
                onClick={() => void loadConnections()}
              >
                Refresh requests ↻
              </button>
            </div>

            <div className="connection-stat-grid">
              <div>
                <span>Total requests</span>
                <strong>{connections.length}</strong>
              </div>
              <div>
                <span>Sent / viewed</span>
                <strong>{totalPending}</strong>
              </div>
              <div>
                <span>Accepted</span>
                <strong>{totalAccepted}</strong>
              </div>
              <div>
                <span>Rejected</span>
                <strong>
                  {connections.filter((item) => item.status === 'Rejected').length}
                </strong>
              </div>
            </div>

            <div className="connection-filter-bar">
              <span>FILTER</span>
              {['All', 'Sent', 'Viewed', 'Accepted', 'Rejected'].map((status) => (
                <button
                  type="button"
                  key={status}
                  className={
                    connectionStatusFilter === status
                      ? 'connection-filter active'
                      : 'connection-filter'
                  }
                  onClick={() => setConnectionStatusFilter(status)}
                >
                  {status}
                </button>
              ))}
            </div>

            {connectionsLoading ? (
              <div className="empty-state">
                <div className="loader" />
                <h3>Loading your connections…</h3>
              </div>
            ) : filteredConnections.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">↗</span>
                <h3>No connections in this view.</h3>
                <p>Send a request from a candidate's proof-of-work profile.</p>
                <button
                  type="button"
                  className="dark-pill-button"
                  onClick={() => setActivePage('search')}
                >
                  Discover talent →
                </button>
              </div>
            ) : (
              <div className="connections-list-new">
                {filteredConnections.map((connection) => (
                  <article
                    className="connection-card-new"
                    key={connection.connect_id}
                  >
                    <div className="connection-avatar">
                      {connection.student_name?.charAt(0) ?? '?'}
                    </div>

                    <div className="connection-main">
                      <div className="connection-name-row">
                        <div>
                          <span>CONNECTION / #{connection.connect_id}</span>
                          <h3>{connection.student_name}</h3>
                          <p>{connection.student_email || 'Email not listed'}</p>
                        </div>
                        <span
                          className={`connection-status ${String(
                            connection.status,
                          ).toLowerCase()}`}
                        >
                          {connection.status}
                        </span>
                      </div>

                      <div className="connection-meta">
                        <div>
                          <span>Company</span>
                          <strong>{connection.company_name}</strong>
                        </div>
                        <div>
                          <span>Challenge</span>
                          <strong>
                            {connection.challenge_title || 'General connection'}
                          </strong>
                        </div>
                      </div>

                      <div className="connection-message-new">
                        <span>MESSAGE</span>
                        <p>{connection.message || 'No message provided.'}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {proofLoading && (
        <div className="modal-overlay">
          <div className="minimal-loading">
            <div className="loader" />
            <span>Loading verified proof…</span>
          </div>
        </div>
      )}

      {selectedProof && (
        <div
          className="modal-overlay"
          onClick={() => setSelectedProof(null)}
        >
          <div
            className="proof-modal-new"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close"
              onClick={() => setSelectedProof(null)}
            >
              ×
            </button>

            <div className="proof-modal-top">
              <div className="proof-identity">
                <div className="proof-avatar-new">
                  {selectedProof.student_name?.charAt(0) ?? '?'}
                </div>
                <div>
                  <span className="section-kicker">VERIFIED PROFILE</span>
                  <h2>{selectedProof.student_name}</h2>
                  <p>
                    {selectedProof.location} · {selectedProof.email}
                  </p>
                </div>
              </div>
              <div className="proof-score-new">
                <span>Profile score</span>
                <strong>{formatNumber(selectedProof.profile_score)}</strong>
              </div>
            </div>

            {proofError && (
              <div className="form-error modal-error">{proofError}</div>
            )}

            <div className="proof-grid">
              <div className="proof-block">
                <span>EDUCATION</span>
                <h3>{selectedProof.education || '—'}</h3>
                <p>{selectedProof.college_name || '—'}</p>
                <small>
                  Graduation: {selectedProof.graduation_year ?? '—'}
                </small>
              </div>

              <div className="proof-block">
                <span>PROJECT / DOMAIN</span>
                <h3>{selectedProof.project_name || '—'}</h3>
                <p>{selectedProof.domain || '—'}</p>
              </div>
            </div>

            <div className="proof-block full">
              <div className="proof-block-heading">
                <div>
                  <span>PROOF OF WORK</span>
                  <h3>Repository evidence</h3>
                </div>
                <span className="verified-label">Verified signal</span>
              </div>

              {selectedProof.github_repos &&
              selectedProof.github_repos.length > 0 ? (
                <div className="repo-list-new">
                  {selectedProof.github_repos.map((repo, index) => (
                    <div className="repo-row" key={`${repo.github_url}-${index}`}>
                      <div>
                        <strong>{repo.project_name}</strong>
                        <p>GitHub repository</p>
                      </div>
                      <div className="repo-actions">
                        {repo.live_demo_url && (
                          <a
                            href={repo.live_demo_url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Live demo ↗
                          </a>
                        )}
                        <a
                          href={repo.github_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Repository ↗
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted-copy">
                  GitHub repository not provided for this project.
                </p>
              )}
            </div>

            <div className="proof-block full">
              <span>SKILLS</span>
              <div className="proof-tags">
                {(selectedProof.skills ?? []).map((skill) => (
                  <span key={skill}>{skill}</span>
                ))}
              </div>
            </div>

            <div className="proof-metrics-new">
              <div>
                <span>AI test</span>
                <strong>{formatNumber(selectedProof.ai_test_score)}</strong>
              </div>
              <div>
                <span>Milestones</span>
                <strong>
                  {formatNumber(selectedProof.milestones_completed)}
                </strong>
              </div>
              <div>
                <span>Blog posts</span>
                <strong>{formatNumber(selectedProof.blog_posts_count)}</strong>
              </div>
              <div>
                <span>Badges</span>
                <strong>{formatNumber(selectedProof.badges_earned)}</strong>
              </div>
            </div>

            <div className="proof-footer">
              <span>
                {existingStatus === 'accepted'
                  ? 'You are connected with this candidate.'
                  : 'Ready to start a conversation?'}
              </span>
              <button
                type="button"
                className="dark-pill-button"
                onClick={openConnectModal}
                disabled={
                  checkingExisting ||
                  sentStudentIds.has(selectedProof.student_id) ||
                  existingStatus === 'pending' ||
                  existingStatus === 'accepted'
                }
              >
                {checkingExisting
                  ? 'Checking…'
                  : existingStatus === 'accepted'
                    ? 'Connected ✓'
                    : sentStudentIds.has(selectedProof.student_id) ||
                        existingStatus === 'pending'
                      ? 'Request pending ✓'
                      : 'Connect with candidate →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {connectModalOpen && selectedProof && (
        <div className="modal-overlay">
          <div className="connect-modal-new">
            <button
              type="button"
              className="modal-close"
              onClick={() => setConnectModalOpen(false)}
            >
              ×
            </button>

            <span className="section-kicker">NEW CONNECTION</span>
            <h2>Start a conversation.</h2>
            <p className="connect-intro">
              Send a focused message to <strong>{selectedProof.student_name}</strong>.
            </p>

            {connectError && (
              <div className="form-error modal-error">{connectError}</div>
            )}
            {challengesError && (
              <div className="form-error modal-error">{challengesError}</div>
            )}

            <label className="modal-field">
              Related challenge
              <select
                value={selectedConnectChallengeId}
                onChange={(event) =>
                  setSelectedConnectChallengeId(event.target.value)
                }
                disabled={challengesLoading}
              >
                <option value="">
                  {challengesLoading ? 'Loading challenges…' : 'General connection'}
                </option>
                {challenges.map((challenge) => (
                  <option
                    key={challenge.challenge_id}
                    value={challenge.challenge_id}
                  >
                    {challenge.challenge_title}
                  </option>
                ))}
              </select>
            </label>

            <label className="modal-field">
              Message
              <textarea
                rows={7}
                value={connectMessage}
                onChange={(event) => setConnectMessage(event.target.value)}
                placeholder="Write a concise message…"
              />
            </label>

            <div className="modal-actions">
              <button
                type="button"
                className="outline-action"
                onClick={() => setConnectModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="dark-pill-button"
                onClick={() => void sendConnectionRequest()}
                disabled={sendingRequest || !connectMessage.trim()}
              >
                {sendingRequest ? 'Sending…' : 'Send request →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {connectSuccess && (
        <div className="modal-overlay">
          <div className="success-modal-new">
            <span className="success-mark">✓</span>
            <span className="section-kicker">CONNECTION SENT</span>
            <h2>Request sent.</h2>
            <p>
              Your connection request has been sent to{' '}
              <strong>{connectSuccess}</strong>.
            </p>
            <button
              type="button"
              className="dark-pill-button"
              onClick={() => setConnectSuccess(null)}
            >
              Done →
            </button>
          </div>
        </div>
      )}

      <footer className="site-footer" id="guide">
        <div className="footer-top">
          <div>
            <div className="brand-lockup">
              <span className="brand-mark">H</span>
              <span className="brand-name">hirezone</span>
            </div>
            <p>
              A proof-first talent discovery workspace for industry recruiters.
            </p>
          </div>
          <div className="footer-links">
            <div>
              <strong>Product</strong>
              <span>Discover talent</span>
              <span>Proof of work</span>
              <span>Challenges</span>
              <span>Connections</span>
            </div>
            <div>
              <strong>Recruiters</strong>
              <span>Search profiles</span>
              <span>Set thresholds</span>
              <span>Review evidence</span>
              <span>Send requests</span>
            </div>
            <div>
              <strong>Workspace</strong>
              <span>Company account</span>
              <span>My connections</span>
              <span>Preferences</span>
              <span>Sign out</span>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 Hirezone</span>
          <span>Industry Talent Discovery Portal</span>
        </div>
      </footer>
    </div>
  )
}

export default App