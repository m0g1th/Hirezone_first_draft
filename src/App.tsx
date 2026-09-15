import {
  useCallback,
  useEffect,
  useRef,
  useState,
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
  location: string
  education: string
  college_name: string
  graduation_year: number
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

type FontSize =
  | 'small'
  | 'medium'
  | 'large'

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

const SESSION_STORAGE_KEY =
  'hirezone:recruiter-session'

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

function getSentStorageKey(
  recruiterId: number,
) {
  return `hirezone:pending-requests:${recruiterId}`
}

function loadPendingIdsFor(
  recruiterId: number,
): Set<number> {
  try {
    const raw =
      localStorage.getItem(
        getSentStorageKey(
          recruiterId,
        ),
      )

    if (!raw) {
      return new Set()
    }

    const arr = JSON.parse(raw)

    return new Set(
      Array.isArray(arr)
        ? arr.map(Number)
        : [],
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
      getSentStorageKey(
        recruiterId,
      ),
      JSON.stringify(
        Array.from(ids),
      ),
    )
  } catch {
    // Ignore storage errors.
  }
}

function loadStoredSession(): RecruiterSession | null {
  try {
    const raw =
      localStorage.getItem(
        SESSION_STORAGE_KEY,
      )

    if (!raw) {
      return null
    }

    const parsed =
      JSON.parse(
        raw,
      ) as RecruiterSession

    if (
      parsed &&
      typeof parsed.recruiter_id ===
        'number' &&
      typeof parsed.company_name ===
        'string'
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
  if (
    value === null ||
    value === undefined
  ) {
    return '—'
  }

  const numeric = Number(value)

  if (!Number.isFinite(numeric)) {
    return '—'
  }

  return numeric.toFixed(
    decimals,
  )
}

function toRpcFilters(
  f: Filters,
  recruiterId: number | null,
) {
  const skills =
    f.skill
      .map((skill) => skill.trim())
      .filter(
        (skill) =>
          skill.length > 0,
      )

  const district =
    f.district.trim()

  const domains =
    f.domain
      .map((domain) =>
        domain.trim(),
      )
      .filter(
        (domain) =>
          domain.length > 0,
      )

  const minScoreText =
    f.minScore.trim()

  const minBadgesText =
    f.minBadges.trim()

  const minScore =
    minScoreText === ''
      ? null
      : Number(minScoreText)

  const minBadges =
    minBadgesText === ''
      ? null
      : Number(minBadgesText)

  return {
    p_skill:
      skills.length > 0
        ? skills
        : null,

    p_district:
      district.length > 0
        ? district
        : null,

    p_domain:
      domains.length > 0
        ? domains
        : null,

    p_min_score:
      minScore !== null &&
      Number.isFinite(minScore)
        ? minScore
        : null,

    p_min_badges:
      minBadges !== null &&
      Number.isFinite(
        minBadges,
      )
        ? Math.floor(
            minBadges,
          )
        : null,

    p_limit: 50,

    p_recruiter_id:
      recruiterId ?? null,
  }
}

function isDuplicateKeyError(
  message: string,
) {
  const value =
    message.toLowerCase()

  return (
    value.includes(
      'duplicate',
    ) ||
    value.includes(
      'unique',
    ) ||
    value.includes(
      'already',
    ) ||
    value.includes(
      '23505',
    )
  )
}

async function fetchExistingConnectStatus(
  recruiterId: number,
  studentId: number,
): Promise<ConnectStatus | null> {
  const tables = [
    'recruiter_connections_view',
    'recruiter_connects',
  ]

  for (const table of tables) {
    try {
      const {
        data,
        error,
      } = await supabase
        .from(table)
        .select('*')
        .eq(
          'recruiter_id',
          recruiterId,
        )
        .eq(
          'student_id',
          studentId,
        )
        .limit(1)

      if (error) {
        continue
      }

      if (
        !data ||
        data.length === 0
      ) {
        continue
      }

      const row =
        data[0] as Record<
          string,
          unknown
        >

      const rawStatus =
        String(
          row.status ??
            row.connection_status ??
            row.request_status ??
            '',
        ).toLowerCase()

      if (
        rawStatus.includes(
          'accept',
        ) ||
        rawStatus.includes(
          'approved',
        )
      ) {
        return 'accepted'
      }

      if (
        rawStatus.includes(
          'pending',
        ) ||
        rawStatus.includes(
          'sent',
        ) ||
        rawStatus.includes(
          'viewed',
        )
      ) {
        return 'pending'
      }

      if (
        rawStatus.includes(
          'reject',
        ) ||
        rawStatus.includes(
          'declin',
        )
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

function App() {
  const [
    candidates,
    setCandidates,
  ] = useState<Candidate[]>([])

  const [
    loading,
    setLoading,
  ] = useState(true)

  const [
    error,
    setError,
  ] = useState('')

  const [
    notice,
    setNotice,
  ] = useState('')

  const [
    filters,
    setFilters,
  ] = useState<Filters>(
    DEFAULT_FILTERS,
  )

  const [
    skillOptions,
    setSkillOptions,
  ] = useState<string[]>(
    DEFAULT_SKILLS,
  )

  const [
    domainOptions,
    setDomainOptions,
  ] = useState<string[]>(
    DEFAULT_DOMAINS,
  )

  const [
    recruiter,
    setRecruiter,
  ] = useState<
    RecruiterSession | null
  >(() =>
    loadStoredSession(),
  )

  const [
    loginRecruiterId,
    setLoginRecruiterId,
  ] = useState('')

  const [
    loginPassword,
    setLoginPassword,
  ] = useState('')

  const [
    authMode,
    setAuthMode,
  ] = useState<
    'login' | 'register'
  >('login')

  const [
    registerCompanyName,
    setRegisterCompanyName,
  ] = useState('')

  const [
    registerEmail,
    setRegisterEmail,
  ] = useState('')

  const [
    registerPassword,
    setRegisterPassword,
  ] = useState('')

  const [
    registerPhone,
    setRegisterPhone,
  ] = useState('')

  const [
    registerLocation,
    setRegisterLocation,
  ] = useState('')

  const [
    registerIndustry,
    setRegisterIndustry,
  ] = useState('')

  const [
    registerCompanyType,
    setRegisterCompanyType,
  ] = useState('')

  const [
    registerWebsite,
    setRegisterWebsite,
  ] = useState('')

  const [
    registerLoading,
    setRegisterLoading,
  ] = useState(false)

  const [
    registerError,
    setRegisterError,
  ] = useState('')

  const [
    registeredRecruiterId,
    setRegisteredRecruiterId,
  ] = useState<
    number | null
  >(null)

  const [
    showRegisterPassword,
    setShowRegisterPassword,
  ] = useState(false)

  const [
    loginLoading,
    setLoginLoading,
  ] = useState(false)

  const [
    loginError,
    setLoginError,
  ] = useState('')

  const [
    showLoginPassword,
    setShowLoginPassword,
  ] = useState(false)

  const [
    activePage,
    setActivePage,
  ] = useState<
    'search' | 'connections'
  >('search')

  const [
    connections,
    setConnections,
  ] = useState<Connection[]>([])

  const [
    connectionsLoading,
    setConnectionsLoading,
  ] = useState(false)

  const [
    connectionStatusFilter,
    setConnectionStatusFilter,
  ] = useState('All')

  const [
    selectedProof,
    setSelectedProof,
  ] = useState<
    CandidateProof | null
  >(null)

  const [
    proofLoading,
    setProofLoading,
  ] = useState(false)

  const [
    proofError,
    setProofError,
  ] = useState('')

  const [
    connectModalOpen,
    setConnectModalOpen,
  ] = useState(false)

  // Challenge selected while sending a connection request.
  const [
    selectedConnectChallengeId,
    setSelectedConnectChallengeId,
  ] = useState('')

  // Challenge selected in candidate search.
  const [
    selectedChallengeId,
    setSelectedChallengeId,
  ] = useState<
    number | null
  >(null)

  const [
    selectedChallenge,
    setSelectedChallenge,
  ] = useState<
    Challenge | null
  >(null)

  const [
    challenges,
    setChallenges,
  ] = useState<Challenge[]>([])

  const [
    challengesLoading,
    setChallengesLoading,
  ] = useState(false)

  const [
    challengesError,
    setChallengesError,
  ] = useState<
    string | null
  >(null)

  const [
    connectMessage,
    setConnectMessage,
  ] = useState(
    DEFAULT_CONNECT_MESSAGE,
  )

  const [
    connectError,
    setConnectError,
  ] = useState('')

  const [
    sendingRequest,
    setSendingRequest,
  ] = useState(false)

  const [
    connectSuccess,
    setConnectSuccess,
  ] = useState<
    string | null
  >(null)

  const [
    existingStatus,
    setExistingStatus,
  ] = useState<ConnectStatus>(
    'none',
  )

  const [
    projectCandidates,
    setProjectCandidates,
  ] = useState<Candidate[]>(
    [],
  )

  const [
    checkingExisting,
    setCheckingExisting,
  ] = useState(false)

  const [
    sentStudentIds,
    setSentStudentIds,
  ] = useState<Set<number>>(
    () => {
      const session =
        loadStoredSession()

      return session
        ? loadPendingIdsFor(
            session.recruiter_id,
          )
        : new Set()
    },
  )

  const [
    settingsOpen,
    setSettingsOpen,
  ] = useState(false)

  const [
    settingsVisible,
    setSettingsVisible,
  ] = useState(false)

  const [
    theme,
    setTheme,
  ] = useState<Theme>(() => {
    return (
      localStorage.getItem(
        'hirezone-theme',
      ) as Theme
    ) || 'light'
  })

  const [
    fontSize,
    setFontSize,
  ] = useState<FontSize>(() => {
    return (
      localStorage.getItem(
        'hirezone-font-size',
      ) as FontSize
    ) || 'medium'
  })

  const [
    animationsEnabled,
    setAnimationsEnabled,
  ] = useState(() => {
    return (
      localStorage.getItem(
        'hirezone-animations',
      ) !== 'false'
    )
  })

  const settingsRef =
    useRef<HTMLDivElement>(
      null,
    )

  const activeRecruiterId =
    recruiter?.recruiter_id ??
    null

  const activeRecruiterCompany =
    recruiter?.company_name ??
    ''

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
    async (
      recruiterId: number,
    ) => {
      setChallengesLoading(true)
      setChallengesError(null)

      try {
        const {
          data,
          error,
        } = await supabase
          .from(
            'sponsored_challenges',
          )
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
          .eq(
            'recruiter_id',
            recruiterId,
          )
          .order(
            'challenge_id',
          )

        if (error) {
          throw error
        }

        setChallenges(
          (data ??
            []) as Challenge[],
        )
      } catch (err) {
        console.error(
          err,
        )

        setChallenges([])
        setChallengesError(
          'Failed to load your challenges.',
        )
      } finally {
        setChallengesLoading(false)
      }
    }

  const loadChallengeCandidates =
    async (
      challengeId: number,
    ) => {
      setLoading(true)
      setError('')
      setNotice('')

      try {
        const {
          data,
          error,
        } = await supabase.rpc(
          'get_challenge_candidates',
          {
            p_challenge_id:
              challengeId,
          },
        )

        if (error) {
          throw error
        }

        const mappedCandidates:
          Candidate[] =
          (data ?? []).map(
            (
              row: Record<
                string,
                unknown
              >,
            ) => ({
              student_id:
                Number(
                  row.student_id ?? 0,
                ),

              student_name:
                String(
                  row.student_name ??
                    '',
                ),

              email:
                String(
                  row.email ?? '',
                ),

              location:
                String(
                  row.location ?? '',
                ),

              education:
                String(
                  row.education ?? '',
                ),

              college_name:
                String(
                  row.college ??
                    row.college_name ??
                    '',
                ),

              graduation_year:
                Number(
                  row.graduation_year ??
                    0,
                ),

              proof_id:
                row.proof_id == null
                  ? null
                  : Number(
                      row.proof_id,
                    ),

              project_name:
                String(
                  row.project_name ??
                    '',
                ),

              domain:
                String(
                  row.domain ?? '',
                ),

              skills:
                Array.isArray(
                  row.skills,
                )
                  ? row.skills.map(
                      String,
                    )
                  : [],

              ai_test_score:
                row.ai_test_score ==
                null
                  ? 0
                  : Number(
                      row.ai_test_score,
                    ),

              ai_test_passed:
                Boolean(
                  row.ai_test_passed ??
                    false,
                ),

              badges_earned:
                row.badges_earned ==
                null
                  ? 0
                  : Number(
                      row.badges_earned,
                    ),

              milestones_completed:
                row.milestones_completed ==
                null
                  ? 0
                  : Number(
                      row.milestones_completed,
                    ),

              blog_posts_count: 0,

              district:
                row.district == null
                  ? ''
                  : String(
                      row.district,
                    ),

              relevance_score:
                row.relevance_score ==
                null
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

  const searchCandidates =
    useCallback(
      async (
        active: Filters,
      ) => {
        setLoading(true)
        setError('')
        setNotice('')

        try {
          const rpcFilters =
            toRpcFilters(
              active,
              activeRecruiterId,
            )

          const {
            data,
            error: rpcError,
          } = await supabase.rpc(
            'search_relevant_candidates',
            rpcFilters,
          )

          if (rpcError) {
            setError(
              `Search failed: ${
                rpcError.message ||
                JSON.stringify(
                  rpcError,
                )
              }`,
            )

            setCandidates([])
            return
          }

          if (
            !Array.isArray(data)
          ) {
            setCandidates([])

            setError(
              'Search returned an unexpected response.',
            )

            return
          }

          const candidateData =
            data as Candidate[]

          setCandidates(
            candidateData,
          )

          const discoveredSkills =
            Array.from(
              new Set(
                candidateData
                  .flatMap(
                    (
                      candidate,
                    ) =>
                      candidate.skills ??
                      [],
                  )
                  .filter(Boolean),
              ),
            )

          const discoveredDomains =
            Array.from(
              new Set(
                candidateData
                  .map(
                    (
                      candidate,
                    ) =>
                      candidate.domain,
                  )
                  .filter(Boolean),
              ),
            )

          if (
            discoveredSkills.length >
            0
          ) {
            setSkillOptions(
              discoveredSkills,
            )
          }

          if (
            discoveredDomains.length >
            0
          ) {
            setDomainOptions(
              discoveredDomains,
            )
          }
        } catch (err) {
          console.error(
            'Unexpected candidate search error:',
            err,
          )

          const errorMessage =
            err instanceof Error
              ? err.message
              : 'Failed to search candidates.'

          setError(
            `Search failed: ${errorMessage}`,
          )

          setCandidates([])
        } finally {
          setLoading(false)
        }
      },
      [
        activeRecruiterId,
      ],
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
        const {
          data,
          error,
        } = await supabase.rpc(
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
            ? data as Connection[]
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
      String(
        animationsEnabled,
      ),
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
          resolved ===
            'pending' ||
          resolved ===
            'accepted'
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

        if (
          resolved === 'none'
        ) {
          setSentStudentIds(
            (previous) => {
              const next =
                new Set(
                  previous,
                )

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
      if (
        event.key !== 'Escape'
      ) {
        return
      }

      if (
        connectSuccess !== null
      ) {
        setConnectSuccess(null)
        return
      }

      if (
        connectModalOpen
      ) {
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
    async (
      event?: React.FormEvent,
    ) => {
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
        !Number.isFinite(
          recruiterId,
        )
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
          row.recruiter_id ==
            null
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
    async (
      event: React.FormEvent,
    ) => {
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
          row.recruiter_id ==
            null
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
    setSentStudentIds(
      new Set(),
    )
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

    setSelectedChallenge(null)

    setProjectCandidates(
      [],
    )

    void searchCandidates(
      DEFAULT_FILTERS,
    )
  }

  const loadCandidateProof = async (studentId: number) => {
  console.log('Opening proof for student:', studentId)
  setProofLoading(true)
  setProofError('')
  setSelectedProof(null)

  try {
    // Load the candidate's proof-of-work details
    const { data, error } = await supabase.rpc(
      'get_candidate_proof',
      { p_student_id: studentId },
    )

    console.log('Proof RPC response:', { data, error })

    if (error) {
      throw new Error(error.message)
    }

    if (!data || !Array.isArray(data) || data.length === 0) {
      throw new Error('No proof-of-work record found for this candidate.')
    }

    const row = data[0]

    // Load ALL GitHub repositories belonging to this student.
    // Do not try to match project names because proof_of_work.project_name
    // and student_projects.project_name may not always be identical.
    const {
      data: githubRepos,
      error: githubError,
    } = await supabase.rpc(
      'get_candidate_github_repos',
      { p_student_id: studentId },
    )

    if (githubError) {
      console.warn(
        'Failed to load GitHub repositories:',
        githubError,
      )
    }

    const repositories = Array.isArray(githubRepos)
      ? githubRepos
          .filter(
            (repo: {
              project_name?: string | null
              github_url?: string | null
              live_demo_url?: string | null
            }) =>
              typeof repo.github_url === 'string' &&
              repo.github_url.trim() !== '',
          )
          .map(
            (repo: {
              project_name?: string | null
              github_url?: string | null
              live_demo_url?: string | null
            }) => ({
              project_name:
                repo.project_name?.trim() || 'Student Project',
              github_url: repo.github_url!.trim(),
              live_demo_url:
                repo.live_demo_url?.trim() || null,
            }),
          )
      : []

    console.log('GitHub repositories loaded:', repositories)

    setSelectedProof({
      student_id: Number(row.student_id),
      student_name: row.student_name ?? '',
      email: row.email ?? '',
      phone: row.phone ?? null,
      location: row.location ?? '',
      education: row.education ?? '',
      college_name: row.college_name ?? '',
      graduation_year:
        row.graduation_year !== null &&
        row.graduation_year !== undefined
          ? Number(row.graduation_year)
          : null,
      proof_id:
        row.proof_id !== null &&
        row.proof_id !== undefined
          ? Number(row.proof_id)
          : null,
      project_name: row.project_name ?? '',
      domain: row.domain ?? '',
      skills: Array.isArray(row.skills) ? row.skills : [],
      milestones_completed:
        row.milestones_completed !== null &&
        row.milestones_completed !== undefined
          ? Number(row.milestones_completed)
          : 0,
      ai_test_score:
        row.ai_test_score !== null &&
        row.ai_test_score !== undefined
          ? Number(row.ai_test_score)
          : null,
      ai_test_passed:
        row.ai_test_passed !== null &&
        row.ai_test_passed !== undefined
          ? Boolean(row.ai_test_passed)
          : false,
      blog_posts_count:
        row.blog_posts_count !== null &&
        row.blog_posts_count !== undefined
          ? Number(row.blog_posts_count)
          : 0,
      badges_earned:
        row.badges_earned !== null &&
        row.badges_earned !== undefined
          ? Number(row.badges_earned)
          : 0,
      profile_score:
        row.profile_score !== null &&
        row.profile_score !== undefined
          ? Number(row.profile_score)
          : null,
      last_updated: row.last_updated ?? null,

      // Store every real GitHub repository returned by Supabase.
      github_repos: repositories,

      // Keep this field for compatibility with any existing code,
      // using the first available repository.
      github_url:
        repositories.length > 0
          ? repositories[0].github_url
          : null,
    })

    console.log('Proof loaded successfully:', row)
  } catch (error) {
    console.error('Failed to load candidate proof:', error)

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
    if (
      !selectedProof
    ) {
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
      existingStatus ===
        'pending' ||
      existingStatus ===
        'accepted'
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
        !selectedConnectChallengeId
      ) {
        setConnectError(
          'Please select a challenge.',
        )

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
        const {
          error,
        } = await supabase.rpc(
          'create_recruiter_connect',
          {
            p_recruiter_id:
              activeRecruiterId,

            p_student_id:
              selectedProof.student_id,

            p_challenge_id:
              Number(
                selectedConnectChallengeId,
              ),

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
            ).add(
              studentId,
            ),
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

  if (!isAuthenticated) {
    return (
      <div className="app">
        <div className="login-wrapper">
          <div className="login-card">
            <div className="login-brand">
              <h1>
                Hirezone
              </h1>

              <p>
                Industry Talent Discovery
                Portal
              </p>
            </div>

            <div className="login-title">
              <h2>
                {authMode ===
                'login'
                  ? 'Recruiter Login'
                  : 'Register Company'}
              </h2>

              <p>
                {authMode ===
                'login'
                  ? 'Sign in with your Recruiter ID to continue'
                  : 'Create your company recruiter account'}
              </p>
            </div>

            <div className="auth-mode-switch">
              <button
                type="button"
                className={
                  authMode ===
                  'login'
                    ? 'auth-mode-active'
                    : ''
                }
                onClick={() => {
                  setAuthMode(
                    'login',
                  )
                  setRegisterError('')
                  setRegisteredRecruiterId(
                    null,
                  )
                }}
              >
                Sign In
              </button>

              <button
                type="button"
                className={
                  authMode ===
                  'register'
                    ? 'auth-mode-active'
                    : ''
                }
                onClick={() => {
                  setAuthMode(
                    'register',
                  )
                  setLoginError('')
                }}
              >
                Register Company
              </button>
            </div>

            {authMode ===
            'login' ? (
              <form
                className="login-form"
                onSubmit={
                  handleLogin
                }
              >
                <label>
                  Recruiter ID
                </label>

                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="e.g. 104"
                  value={
                    loginRecruiterId
                  }
                  onChange={(
                    event,
                  ) =>
                    setLoginRecruiterId(
                      event.target
                        .value,
                    )
                  }
                />

                <label>
                  Password
                </label>

                <div className="login-password-field">
                  <input
                    type={
                      showLoginPassword
                        ? 'text'
                        : 'password'
                    }
                    placeholder="Enter password"
                    value={
                      loginPassword
                    }
                    onChange={(
                      event,
                    ) =>
                      setLoginPassword(
                        event.target
                          .value,
                      )
                    }
                    autoComplete="current-password"
                  />

                  <button
                    type="button"
                    className="login-show-password"
                    onClick={() =>
                      setShowLoginPassword(
                        (
                          value,
                        ) => !value,
                      )
                    }
                  >
                    {showLoginPassword
                      ? 'Hide'
                      : 'Show'}
                  </button>
                </div>

                {loginError && (
                  <div className="inline-error">
                    {loginError}
                  </div>
                )}

                <button
                  type="submit"
                  className="login-button"
                  disabled={
                    loginLoading
                  }
                >
                  {loginLoading
                    ? 'Signing in...'
                    : 'Sign In'}
                </button>
              </form>
            ) : (
              <form
                className="login-form register-form"
                onSubmit={
                  handleRegister
                }
              >
                <label>
                  Company Name *
                </label>

                <input
                  type="text"
                  placeholder="Enter company name"
                  value={
                    registerCompanyName
                  }
                  onChange={(
                    event,
                  ) =>
                    setRegisterCompanyName(
                      event.target
                        .value,
                    )
                  }
                />

                <label>
                  Email Address *
                </label>

                <input
                  type="email"
                  placeholder="company@example.com"
                  value={
                    registerEmail
                  }
                  onChange={(
                    event,
                  ) =>
                    setRegisterEmail(
                      event.target
                        .value,
                    )
                  }
                  autoComplete="email"
                />

                <label>
                  Password *
                </label>

                <div className="login-password-field">
                  <input
                    type={
                      showRegisterPassword
                        ? 'text'
                        : 'password'
                    }
                    placeholder="Minimum 6 characters"
                    value={
                      registerPassword
                    }
                    onChange={(
                      event,
                    ) =>
                      setRegisterPassword(
                        event.target
                          .value,
                      )
                    }
                    autoComplete="new-password"
                  />

                  <button
                    type="button"
                    className="login-show-password"
                    onClick={() =>
                      setShowRegisterPassword(
                        (
                          value,
                        ) => !value,
                      )
                    }
                  >
                    {showRegisterPassword
                      ? 'Hide'
                      : 'Show'}
                  </button>
                </div>

                <label>
                  Phone
                </label>

                <input
                  type="tel"
                  placeholder="Enter phone number"
                  value={
                    registerPhone
                  }
                  onChange={(
                    event,
                  ) =>
                    setRegisterPhone(
                      event.target
                        .value,
                    )
                  }
                />

                <label>
                  Location
                </label>

                <input
                  type="text"
                  placeholder="e.g. Bengaluru"
                  value={
                    registerLocation
                  }
                  onChange={(
                    event,
                  ) =>
                    setRegisterLocation(
                      event.target
                        .value,
                    )
                  }
                />

                <label>
                  Industry
                </label>

                <input
                  type="text"
                  placeholder="e.g. Technology"
                  value={
                    registerIndustry
                  }
                  onChange={(
                    event,
                  ) =>
                    setRegisterIndustry(
                      event.target
                        .value,
                    )
                  }
                />

                <label>
                  Company Type
                </label>

                <select
                  value={
                    registerCompanyType
                  }
                  onChange={(
                    event,
                  ) =>
                    setRegisterCompanyType(
                      event.target
                        .value,
                    )
                  }
                >
                  <option value="">
                    Select company type
                  </option>

                  <option value="Startup">
                    Startup
                  </option>

                  <option value="SME">
                    SME
                  </option>

                  <option value="Enterprise">
                    Enterprise
                  </option>
                </select>

                <label>
                  Website
                </label>

                <input
                  type="url"
                  placeholder="https://example.com"
                  value={
                    registerWebsite
                  }
                  onChange={(
                    event,
                  ) =>
                    setRegisterWebsite(
                      event.target
                        .value,
                    )
                  }
                />

                {registerError && (
                  <div className="inline-error">
                    {registerError}
                  </div>
                )}

                {registeredRecruiterId !==
                  null && (
                  <div className="registration-success">
                    <strong>
                      Registration successful!
                    </strong>

                    <span>
                      Your Recruiter ID
                      is:{' '}
                      {
                        registeredRecruiterId
                      }
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode(
                          'login',
                        )
                        setRegisteredRecruiterId(
                          null,
                        )
                      }}
                    >
                      Continue to Sign In
                    </button>
                  </div>
                )}

                <button
                  type="submit"
                  className="login-button"
                  disabled={
                    registerLoading
                  }
                >
                  {registerLoading
                    ? 'Creating account...'
                    : 'Create Company Account'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>
            Hirezone
          </h1>

          <p>
            Industry Talent Discovery
            Portal
          </p>
        </div>

        <div className="nav-buttons">
          <button
            className={
              activePage ===
              'search'
                ? 'nav-active'
                : ''
            }
            onClick={() =>
              setActivePage(
                'search',
              )
            }
          >
            Find Candidates
          </button>

          <button
            className={
              activePage ===
              'connections'
                ? 'nav-active'
                : ''
            }
            onClick={() => {
              setActivePage(
                'connections',
              )

              void loadConnections()
            }}
          >
            My Connections
          </button>
        </div>

        <div className="header-actions">
          <div className="recruiter">
            <span>
              Recruiter #
              {activeRecruiterId}
              {' • '}
              Recruiter Portal
            </span>

            <strong>
              {activeRecruiterCompany}
            </strong>
          </div>

          <button
            type="button"
            className="logout-button"
            onClick={
              handleLogout
            }
          >
            Logout
          </button>

          <div
            className="settings-wrapper"
            ref={settingsRef}
          >
            <button
              type="button"
              className="settings-button"
              onClick={(event) => {
                event.stopPropagation()

                if (settingsOpen) {
                  closeSettings()
                } else {
                  openSettings()
                }
              }}
              aria-expanded={
                settingsOpen
              }
              aria-label="Open settings"
            >
              ⚙
            </button>

            {settingsVisible && (
              <div
                className={`settings-menu ${
                  settingsOpen
                    ? 'settings-menu-open'
                    : 'settings-menu-closing'
                }`}
              >
                <div className="settings-title">
                  <h3>
                    Settings
                  </h3>
                </div>

                <div className="setting-section">
                  <span className="setting-label">
                    Appearance
                  </span>

                  <div className="theme-options">
                    <button
                      type="button"
                      className={
                        theme ===
                        'light'
                          ? 'setting-active'
                          : ''
                      }
                      onClick={() =>
                        setTheme(
                          'light',
                        )
                      }
                    >
                      ☀ Light
                    </button>

                    <button
                      type="button"
                      className={
                        theme ===
                        'dark'
                          ? 'setting-active'
                          : ''
                      }
                      onClick={() =>
                        setTheme(
                          'dark',
                        )
                      }
                    >
                      🌙 Dark
                    </button>
                  </div>
                </div>

                <div className="setting-section">
                  <span className="setting-label">
                    Font Size
                  </span>

                  <div className="theme-options">
                    {(
                      [
                        'small',
                        'medium',
                        'large',
                      ] as FontSize[]
                    ).map(
                      (size) => (
                        <button
                          key={size}
                          type="button"
                          className={
                            fontSize ===
                            size
                              ? 'setting-active'
                              : ''
                          }
                          onClick={() =>
                            setFontSize(
                              size,
                            )
                          }
                        >
                          {size}
                        </button>
                      ),
                    )}
                  </div>
                </div>

                <div className="setting-section">
                  <button
                    type="button"
                    onClick={() =>
                      setAnimationsEnabled(
                        (
                          value,
                        ) => !value,
                      )
                    }
                  >
                    Animations:{' '}
                    {animationsEnabled
                      ? 'On'
                      : 'Off'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="container">
        {activePage ===
        'search' ? (
          <>
            <section className="hero">
              <div>
                <h2>
                  Discover Exceptional
                  Talent
                </h2>

                <p>
                  Search verified student
                  profiles, technical skills
                  and proof-of-work.
                </p>
              </div>

              <div className="candidate-count">
                <strong>
                  {candidates.length}
                </strong>

                <span>
                  Candidates Found
                </span>
              </div>
            </section>

            <section className="filters">
              <div className="filters-header">
                <h3>
                  Candidate Filters
                </h3>

                <button
                  type="button"
                  className="clear-button"
                  onClick={
                    clearFilters
                  }
                >
                  Clear Filters
                </button>
              </div>

              <div className="filter-grid">
                <select
                  value={
                    selectedChallengeId
                      ? String(
                          selectedChallengeId,
                        )
                      : ''
                  }
                  onChange={(event) => {
                    const value =
                      event.target.value

                    if (!value) {
                      setSelectedChallengeId(
                        null,
                      )

                      setSelectedChallenge(
                        null,
                      )

                      setProjectCandidates(
                        [],
                      )

                      void searchCandidates(
                        filters,
                      )

                      return
                    }

                    const challengeId =
                      Number(value)

                    const challenge =
                      challenges.find(
                        (
                          item,
                        ) =>
                          item.challenge_id ===
                          challengeId,
                      ) ?? null

                    setSelectedChallenge(
                      challenge,
                    )

                    void loadChallengeCandidates(
                      challengeId,
                    )
                  }}
                >
                  <option value="">
                    All Candidates
                  </option>

                  {challenges.map(
                    (
                      challenge,
                    ) => (
                      <option
                        key={
                          challenge.challenge_id
                        }
                        value={
                          challenge.challenge_id
                        }
                      >
                        {
                          challenge.challenge_title
                        }
                      </option>
                    ),
                  )}
                </select>

                <select
                  value=""
                  onChange={(event) => {
                    const selectedSkill =
                      event.target.value

                    if (
                      selectedSkill &&
                      !filters.skill.includes(
                        selectedSkill,
                      )
                    ) {
                      setFilters(
                        (
                          previous,
                        ) => ({
                          ...previous,
                          skill: [
                            ...previous.skill,
                            selectedSkill,
                          ],
                        }),
                      )
                    }
                  }}
                >
                  <option value="">
                    Add Skill
                  </option>

                  {skillOptions.map(
                    (skill) => (
                      <option
                        key={skill}
                        value={skill}
                      >
                        {skill}
                      </option>
                    ),
                  )}
                </select>

                {filters.skill.length >
                  0 && (
                  <div className="selected-options">
                    {filters.skill.map(
                      (skill) => (
                        <button
                          key={skill}
                          type="button"
                          className="selected-option"
                          onClick={() =>
                            setFilters(
                              (
                                previous,
                              ) => ({
                                ...previous,
                                skill:
                                  previous.skill.filter(
                                    (
                                      item,
                                    ) =>
                                      item !==
                                      skill,
                                  ),
                              }),
                            )
                          }
                        >
                          {skill} ×
                        </button>
                      ),
                    )}
                  </div>
                )}

                <select
                  value={
                    filters.district
                  }
                  onChange={(event) =>
                    setFilters(
                      (
                        previous,
                      ) => ({
                        ...previous,
                        district:
                          event.target
                            .value,
                      }),
                    )
                  }
                >
                  <option value="">
                    All Districts
                  </option>

                  <option value="Mumbai City">
                    Mumbai City
                  </option>

                  <option value="Mumbai Suburban">
                    Mumbai Suburban
                  </option>

                  <option value="Pune">
                    Pune
                  </option>

                  <option value="Thane">
                    Thane
                  </option>

                  <option value="Nagpur">
                    Nagpur
                  </option>

                  <option value="Nashik">
                    Nashik
                  </option>

                  <option value="Chhatrapati Sambhajinagar">
                    Chhatrapati
                    Sambhajinagar
                  </option>

                  <option value="Solapur">
                    Solapur
                  </option>

                  <option value="Kolhapur">
                    Kolhapur
                  </option>

                  <option value="Satara">
                    Satara
                  </option>

                  <option value="Sangli">
                    Sangli
                  </option>

                  <option value="Ahmednagar">
                    Ahmednagar
                  </option>
                </select>

                <select
                  value=""
                  onChange={(event) => {
                    const selectedDomain =
                      event.target.value

                    if (
                      selectedDomain &&
                      !filters.domain.includes(
                        selectedDomain,
                      )
                    ) {
                      setFilters(
                        (
                          previous,
                        ) => ({
                          ...previous,
                          domain: [
                            ...previous.domain,
                            selectedDomain,
                          ],
                        }),
                      )
                    }
                  }}
                >
                  <option value="">
                    Add Domain
                  </option>

                  {domainOptions.map(
                    (
                      domain,
                    ) => (
                      <option
                        key={domain}
                        value={domain}
                      >
                        {domain}
                      </option>
                    ),
                  )}
                </select>

                {filters.domain.length >
                  0 && (
                  <div className="selected-options">
                    {filters.domain.map(
                      (
                        domain,
                      ) => (
                        <button
                          key={domain}
                          type="button"
                          className="selected-option"
                          onClick={() =>
                            setFilters(
                              (
                                previous,
                              ) => ({
                                ...previous,
                                domain:
                                  previous.domain.filter(
                                    (
                                      item,
                                    ) =>
                                      item !==
                                      domain,
                                  ),
                              }),
                            )
                          }
                        >
                          {domain} ×
                        </button>
                      ),
                    )}
                  </div>
                )}

                <input
                  type="number"
                  min={0}
                  placeholder="Minimum AI Score"
                  value={
                    filters.minScore
                  }
                  onChange={(event) =>
                    setFilters(
                      (
                        previous,
                      ) => ({
                        ...previous,
                        minScore:
                          event.target
                            .value,
                      }),
                    )
                  }
                />

                <input
                  type="number"
                  min={0}
                  placeholder="Minimum Badges"
                  value={
                    filters.minBadges
                  }
                  onChange={(event) =>
                    setFilters(
                      (
                        previous,
                      ) => ({
                        ...previous,
                        minBadges:
                          event.target
                            .value,
                      }),
                    )
                  }
                />

                <button
                  type="button"
                  className="search-button"
                  onClick={
                    handleSearch
                  }
                  disabled={
                    loading
                  }
                >
                  {loading
                    ? 'Searching...'
                    : 'Search Candidates'}
                </button>
              </div>
            </section>

            {notice && (
              <div className="notice">
                {notice}
              </div>
            )}

            {loading && (
              <div className="status">
                Searching for candidates...
              </div>
            )}

            {error && (
              <div className="error">
                Error: {error}
              </div>
            )}

            {!loading &&
              !error && (
                <section className="results">
                  <div className="results-header">
                    <h2>
                      Candidate Results
                    </h2>
                  </div>

                  {candidates.length ===
                  0 ? (
                    <div className="status">
                      No candidates match
                      your filters.
                    </div>
                  ) : (
                    <div className="candidate-grid">
                      {candidates.map(
                        (
                          candidate,
                          index,
                        ) => (
                          <article
                            className="candidate-card"
                            key={`${candidate.student_id}-${candidate.project_name}-${index}`}
                          >
                            <div className="candidate-top">
                              <div className="avatar">
                                {candidate.student_name?.charAt(
                                  0,
                                ) ?? '?'}
                              </div>

                              <div>
                                <h3>
                                  {
                                    candidate.student_name
                                  }
                                </h3>

                                <p>
                                  {
                                    candidate.location
                                  }
                                </p>
                              </div>

                              <div className="candidate-score-stack">
                                <div className="relevance-score">
                                  <span>
                                    Match Score
                                  </span>

                                  <strong>
                                    {formatNumber(
                                      candidate.relevance_score,
                                    )}
                                  </strong>
                                </div>
                              </div>
                            </div>

                            <p className="college">
                              {
                                candidate.college_name
                              }
                            </p>

                            <div className="project">
                              <span>
                                PROJECT
                              </span>

                              <strong>
                                {
                                  candidate.project_name
                                }
                              </strong>
                            </div>

                            <div className="skills">
                              {(
                                candidate.skills ??
                                []
                              )
                                .slice(
                                  0,
                                  4,
                                )
                                .map(
                                  (
                                    skill,
                                  ) => (
                                    <span
                                      key={`${candidate.student_id}-${skill}`}
                                    >
                                      {skill}
                                    </span>
                                  ),
                                )}
                            </div>

                            {(candidate.matched_challenges ??
                              0) >
                              0 && (
                              <div className="challenge-match">
                                <strong>
                                  Matches{' '}
                                  {
                                    candidate.matched_challenges
                                  }
                                </strong>

                                <span>
                                  recruiter
                                  challenge
                                  {(candidate.matched_challenges ??
                                    0) >
                                  1
                                    ? 's'
                                    : ''}
                                </span>
                              </div>
                            )}

                            <div className="metrics">
                              <div>
                                <span>
                                  AI Score
                                </span>

                                <strong>
                                  {formatNumber(
                                    candidate.ai_test_score,
                                  )}
                                </strong>
                              </div>

                              <div>
                                <span>
                                  Badges
                                </span>

                                <strong>
                                  {formatNumber(
                                    candidate.badges_earned,
                                  )}
                                </strong>
                              </div>

                              <div>
                                <span>
                                  District
                                </span>

                                <strong>
                                  {
                                    candidate.district ??
                                    '—'
                                  }
                                </strong>
                              </div>
                            </div>

                            <div className="candidate-actions">
                              <button
                                type="button"
                                className="view-button"
                                onClick={() =>
                                  void loadCandidateProof(
                                    candidate.student_id,
                                  )
                                }
                                disabled={
                                  proofLoading
                                }
                              >
                                View Proof of
                                Work
                              </button>

                              {sentStudentIds.has(
                                candidate.student_id,
                              ) && (
                                <div className="sent-badge">
                                  Request Pending
                                  ✓
                                </div>
                              )}
                            </div>
                          </article>
                        ),
                      )}
                    </div>
                  )}
                </section>
              )}
          </>
        ) : (
          <div className="connections-page">
            <div className="connections-header">
              <div>
                <h2>
                  My Connections
                </h2>

                <p>
                  Track and manage your
                  candidate connection
                  requests
                </p>
              </div>

              <button
                type="button"
                className="refresh-button"
                onClick={() =>
                  void loadConnections()
                }
              >
                Refresh
              </button>
            </div>

            <div className="connection-stats">
              {[
                [
                  'Total',
                  connections.length,
                ],
                [
                  'Sent',
                  connections.filter(
                    (
                      item,
                    ) =>
                      item.status ===
                      'Sent',
                  ).length,
                ],
                [
                  'Viewed',
                  connections.filter(
                    (
                      item,
                    ) =>
                      item.status ===
                      'Viewed',
                  ).length,
                ],
                [
                  'Accepted',
                  connections.filter(
                    (
                      item,
                    ) =>
                      item.status ===
                      'Accepted',
                  ).length,
                ],
              ].map(
                (
                  [
                    label,
                    value,
                  ],
                ) => (
                  <div
                    className="stat-card"
                    key={String(
                      label,
                    )}
                  >
                    <span>
                      {label}
                    </span>

                    <strong>
                      {value}
                    </strong>
                  </div>
                ),
              )}
            </div>

            <div className="status-filters">
              {[
                'All',
                'Sent',
                'Viewed',
                'Accepted',
                'Rejected',
              ].map(
                (status) => (
                  <button
                    key={status}
                    type="button"
                    className={
                      connectionStatusFilter ===
                      status
                        ? 'filter-active'
                        : ''
                    }
                    onClick={() =>
                      setConnectionStatusFilter(
                        status,
                      )
                    }
                  >
                    {status}
                  </button>
                ),
              )}
            </div>

            {connectionsLoading ? (
              <div className="status">
                Loading connections...
              </div>
            ) : filteredConnections.length ===
              0 ? (
              <div className="status">
                No connections found.
              </div>
            ) : (
              <div className="connections-list">
                {filteredConnections.map(
                  (
                    connection,
                  ) => (
                    <article
                      className="connection-card"
                      key={
                        connection.connect_id
                      }
                    >
                      <div className="connection-top">
                        <div>
                          <h3>
                            {
                              connection.student_name
                            }
                          </h3>

                          <p>
                            {
                              connection.student_email
                            }
                          </p>
                        </div>

                        <span
                          className={`status-badge status-${String(
                            connection.status,
                          ).toLowerCase()}`}
                        >
                          {
                            connection.status
                          }
                        </span>
                      </div>

                      <div className="connection-details">
                        <div>
                          <span>
                            Company
                          </span>

                          <p>
                            {
                              connection.company_name
                            }
                          </p>
                        </div>

                        <div>
                          <span>
                            Challenge
                          </span>

                          <p>
                            {
                              connection.challenge_title ??
                              'General Connection'
                            }
                          </p>
                        </div>
                      </div>

                      <div className="connection-message">
                        <span>
                          Message
                        </span>

                        <p>
                          {
                            connection.message
                          }
                        </p>
                      </div>
                    </article>
                  ),
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {proofLoading && (
        <div className="modal-overlay">
          <div className="loading-modal">
            Loading candidate proof...
          </div>
        </div>
      )}

      {selectedProof && (
        <div
          className="modal-overlay"
          onClick={() =>
            setSelectedProof(
              null,
            )
          }
        >
          <div
            className="proof-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <button
              type="button"
              className="close-button"
              onClick={() =>
                setSelectedProof(
                  null,
                )
              }
            >
              ×
            </button>

            <div className="proof-header">
              <div className="proof-avatar">
                {selectedProof.student_name?.charAt(
                  0,
                ) ?? '?'}
              </div>

              <div>
                <h2>
                  {
                    selectedProof.student_name
                  }
                </h2>

                <p>
                  {
                    selectedProof.location
                  }
                </p>

                <p>
                  {
                    selectedProof.email
                  }
                </p>
              </div>

              <div className="proof-score">
                <span>
                  Profile Score
                </span>

                <strong>
                  {formatNumber(
                    selectedProof.profile_score,
                  )}
                </strong>
              </div>
            </div>

            {proofError && (
              <div className="inline-error">
                {proofError}
              </div>
            )}

            <div className="proof-section">
              <h3>
                Education
              </h3>

              <p>
                <strong>
                  {
                    selectedProof.education
                  }
                </strong>
              </p>

              <p>
                {
                  selectedProof.college_name
                }
              </p>

              <p>
                Graduation Year:{' '}
                {
                  selectedProof.graduation_year
                }
              </p>
            </div>

            <div className="proof-section">
              <h3>
                Proof of Work
              </h3>

              <div className="proof-project">
                <span>
                  PROJECT
                </span>

                <h4>
                  {
                    selectedProof.project_name
                  }
                </h4>

                <p>
                  {
                    selectedProof.domain
                  }
                </p>
              </div>
<div className="proof-section">
  <h3>GitHub Repositories</h3>

  {selectedProof.github_repos &&
  selectedProof.github_repos.length > 0 ? (
    <div className="github-repository-list">
      {selectedProof.github_repos.map((repo, index) => (
        <div
          className="github-repository-item"
          key={`${repo.github_url}-${index}`}
        >
          <div className="github-repository-info">
            <strong>
              {repo.project_name || 'Student Project'}
            </strong>

            {repo.live_demo_url && (
              <a
                href={repo.live_demo_url}
                target="_blank"
                rel="noopener noreferrer"
                className="live-demo-link"
              >
                View Live Demo
              </a>
            )}
          </div>

          <a
            href={repo.github_url}
            target="_blank"
            rel="noopener noreferrer"
            className="github-repository-link"
          >
            View Repository
          </a>
        </div>
      ))}
    </div>
  ) : (
    <p className="github-unavailable">
      No GitHub repository provided by this candidate.
    </p>
  )}
</div>              <div className="proof-skills">
                {(
                  selectedProof.skills ??
                  []
                ).map(
                  (skill) => (
                    <span key={skill}>
                      {skill}
                    </span>
                  ),
                )}
              </div>
            </div>

            <div className="proof-metrics">
              <div>
                <span>
                  AI Test Score
                </span>

                <strong>
                  {formatNumber(
                    selectedProof.ai_test_score,
                  )}
                </strong>
              </div>

              <div>
                <span>
                  Milestones
                </span>

                <strong>
                  {formatNumber(
                    selectedProof.milestones_completed,
                  )}
                </strong>
              </div>

              <div>
                <span>
                  Blog Posts
                </span>

                <strong>
                  {formatNumber(
                    selectedProof.blog_posts_count,
                  )}
                </strong>
              </div>

              <div>
                <span>
                  Badges
                </span>

                <strong>
                  {formatNumber(
                    selectedProof.badges_earned,
                  )}
                </strong>
              </div>
            </div>

            <button
              type="button"
              className="connect-button"
              onClick={
                openConnectModal
              }
              disabled={
                checkingExisting ||
                sentStudentIds.has(
                  selectedProof.student_id,
                ) ||
                existingStatus ===
                  'pending' ||
                existingStatus ===
                  'accepted'
              }
            >
              {checkingExisting
                ? 'Checking request...'
                : existingStatus ===
                    'accepted'
                  ? 'Connected ✓'
                  : sentStudentIds.has(
                        selectedProof.student_id,
                      ) ||
                    existingStatus ===
                      'pending'
                    ? 'Request Pending ✓'
                    : 'Connect with Candidate'}
            </button>
          </div>
        </div>
      )}

      {connectModalOpen &&
        selectedProof && (
          <div className="modal-overlay">
            <div className="connect-modal">
              <button
                type="button"
                className="close-button"
                onClick={() =>
                  setConnectModalOpen(
                    false,
                  )
                }
              >
                ×
              </button>

              <h2>
                Connect with Candidate
              </h2>

              <p>
                Connecting with{' '}

                <strong>
                  {
                    selectedProof.student_name
                  }
                </strong>
              </p>

              {connectError && (
                <div className="inline-error">
                  {connectError}
                </div>
              )}

              {challengesError && (
                <div className="inline-error">
                  {challengesError}
                </div>
              )}

              <label>
                Related Challenge
              </label>

              <select
                value={
                  selectedConnectChallengeId
                }
                onChange={(event) =>
                  setSelectedConnectChallengeId(
                    event.target.value,
                  )
                }
                disabled={
                  challengesLoading
                }
              >
                <option value="">
                  {challengesLoading
                    ? 'Loading challenges...'
                    : 'Select a challenge'}
                </option>

                {challenges.map(
                  (
                    challenge,
                  ) => (
                    <option
                      key={
                        challenge.challenge_id
                      }
                      value={
                        challenge.challenge_id
                      }
                    >
                      {
                        challenge.challenge_title
                      }
                    </option>
                  ),
                )}
              </select>

              <label>
                Message
              </label>

              <textarea
                value={
                  connectMessage
                }
                onChange={(event) =>
                  setConnectMessage(
                    event.target.value,
                  )
                }
                rows={6}
              />

              <div className="connect-actions">
                <button
                  type="button"
                  className="cancel-button"
                  onClick={() =>
                    setConnectModalOpen(
                      false,
                    )
                  }
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="send-button"
                  onClick={() =>
                    void sendConnectionRequest()
                  }
                  disabled={
                    sendingRequest ||
                    !selectedConnectChallengeId ||
                    !connectMessage.trim()
                  }
                >
                  {sendingRequest
                    ? 'Sending...'
                    : 'Send Request'}
                </button>
              </div>
            </div>
          </div>
        )}

      {connectSuccess && (
        <div className="modal-overlay">
          <div className="success-modal">
            <div className="success-icon">
              ✓
            </div>

            <h2>
              Request Sent!
            </h2>

            <p>
              Your connection request has
              been sent to{' '}

              <strong>
                {connectSuccess}
              </strong>
              .
            </p>

            <button
              type="button"
              className="send-button"
              onClick={() =>
                setConnectSuccess(
                  null,
                )
              }
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App

