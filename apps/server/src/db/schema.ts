import { pgTable, uuid, text, timestamp, bigserial, jsonb, boolean, integer, primaryKey, unique, date } from "drizzle-orm/pg-core";

// Foundation tables only. Feature tables get added per feature, in that feature's folder.

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  registrationMode: text("registration_mode").notNull().default("INVITE_ONLY"), // INVITE_ONLY | OPEN (self-register → pending)
  timezone: text("timezone").notNull().default("UTC"), // IANA tz; drives how scheduled times (sessions, clue release, matches) render
  usageLogEnabled: boolean("usage_log_enabled").notNull().default(false), // off by default — opt-in oversight (reads as micromanagement)
  profilePicsEnabled: boolean("profile_pics_enabled").notNull().default(true), // institution can turn profile pictures on/off
  disabledModules: jsonb("disabled_modules").$type<string[]>().notNull().default([]), // optional feature areas the org has hidden from the nav (declutter, not security)
  brandColor: text("brand_color").notNull().default("blue"), // accent palette key (drives --brand-hue across the UI)
  brandEmoji: text("brand_emoji"), // optional wordmark emoji shown beside the workspace name in the sidebar
  brandLogoUrl: text("brand_logo_url"), // optional uploaded logo image (shown instead of the emoji wordmark)
  welcomeMessage: text("welcome_message"), // optional message shown on the dashboard
  terms: jsonb("terms").$type<Record<string, string>>().notNull().default({}), // white-label vocabulary overrides (points→"Coins" etc.)
  footerCredit: boolean("footer_credit").notNull().default(true), // show "© year · version" in the footer

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Org hierarchy: Org > Division > Department > Unit > Team (+ virtual groups).
// `path` is a materialized path (e.g. "acme.sales.east"); we'll move to ltree
// when subtree queries actually need it — a plain text path is enough for now.
export const orgNodes = pgTable("org_nodes", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  parentId: uuid("parent_id"),
  nodeType: text("node_type").notNull(), // ORG|DIVISION|DEPARTMENT|UNIT|TEAM|VIRTUAL
  name: text("name").notNull(),
  path: text("path").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Real accounts. Email + scrypt password hash today; OIDC subjects get added later
// (passwordHash stays null for SSO users). One deployment = one company = one tenant.
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  nodeId: uuid("node_id").references(() => orgNodes.id), // home node in the org tree (nullable)
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  jobTitle: text("job_title"), // optional, admin-set — e.g. "Senior Engineer" (display only, not a role)
  avatarUrl: text("avatar_url"), // optional profile picture URL (self-set; shown only if the tenant allows pics)
  statusText: text("status_text"), // optional self-set status/headline shown on the dashboard + profile
  hobbies: text("hobbies"), // optional self-set hobbies / interests (free text, shown on the profile)
  highSchool: text("high_school"), // optional self-set high school (free text, shown on the profile)
  flair: text("flair"), // equipped FLAIR augment — an emoji shown next to the name (owned via a PROFILE redemption)
  title: text("title"), // equipped TITLE augment — a short text title shown on the profile (owned)
  nameColor: text("name_color"), // equipped COLOR augment — a palette token colouring the name + avatar ring (owned)
  passwordHash: text("password_hash"), // null = no local password (SSO-only / directory-only)
  role: text("role").notNull().default("MEMBER"), // TENANT_ADMIN|NODE_ADMIN|FACILITATOR|MEMBER
  status: text("status").notNull().default("ACTIVE"), // ACTIVE|DISABLED
  deactivatedAt: timestamp("deactivated_at", { withTimezone: true }), // when offboarded → starts the PII-retention clock
  erasedAt: timestamp("erased_at", { withTimezone: true }), // when PII was scrubbed (right-to-erasure / retention purge)
  emailVerified: boolean("email_verified").notNull().default(false),
  // 2FA lands here later: totpSecret + a verification step in /login. Not built yet.
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Invite-only registration: an admin creates one of these and emails the token link.
export const invites = pgTable("invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  email: text("email").notNull(),
  role: text("role").notNull().default("MEMBER"),
  token: text("token").notNull().unique(),
  invitedBy: uuid("invited_by").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// A Session is the hosted "room" / activity-group for a meeting. The host runs
// activities inside it; people join once and stay for the whole session.
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  hostId: uuid("host_id").notNull(), // current host (can change via pass/failover)
  creatorId: uuid("creator_id"), // who created it — can always reclaim host
  title: text("title").notNull(),
  joinCode: text("join_code"), // short shareable code: "Join session ABC123"
  scopeKind: text("scope_kind"), // ALL | NODE | GROUP auto-invite (null = invite-only)
  scopeId: uuid("scope_id"), // node or group id (null for ALL)
  activeAgendaId: uuid("active_agenda_id"), // the agenda item currently in focus

  // Extensible meeting settings (grows over time). joinPolicy: OPEN | APPROVAL (lobby).
  // participantStart: can non-hosts start activities; participantTypes: which ones they may start.
  settings: jsonb("settings").$type<{ joinPolicy?: "OPEN" | "APPROVAL"; participantStart?: boolean; participantTypes?: string[] }>(),
  state: text("state").notNull().default("DRAFT"), // DRAFT | SCHEDULED | LIVE | ENDED
  scheduledAt: timestamp("scheduled_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
});

// One row per invited person. Tracks the join lifecycle.
export const sessionParticipants = pgTable(
  "session_participants",
  {
    sessionId: uuid("session_id").notNull().references(() => sessions.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    // INVITED | JOINED | DECLINED | MISSED | LEFT | REMOVED
    state: text("state").notNull().default("INVITED"),
    sessionRole: text("session_role"), // null = member; COHOST = can drive activities + invite/remove
    accessRevoked: boolean("access_revoked").notNull().default(false), // can no longer see the session/log
    presentation: boolean("presentation").notNull().default(false), // TV / projector watcher — excluded from random-pick pools
    batchId: uuid("batch_id"), // set when invited as part of a bulk group invite
    invitedAt: timestamp("invited_at").defaultNow().notNull(),
    respondedAt: timestamp("responded_at"),
  },
  (t) => ({ pk: primaryKey({ columns: [t.sessionId, t.userId] }) }),
);

// An activity runs inside a session. One LIVE at a time; the host drives it.
export const activities = pgTable("activities", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => sessions.id),
  type: text("type").notNull(), // RANDOMIZER (more later)
  title: text("title").notNull(),
  startedBy: uuid("started_by"), // host or cohost who launched it (for the log)
  agendaItemId: uuid("agenda_item_id"), // the agenda item this activity ran under (set at launch)
  config: jsonb("config").$type<{
    removeAfterPick?: boolean; // randomizer
    includeHost?: boolean; // randomizer — include the host in the draw
    anonymous?: boolean; // nomination — default true; named voting must be host-enabled
    showCounts?: boolean; // nomination — results visible to participants (host can toggle)
    timerSeconds?: number; // nomination — optional voting countdown
    description?: string; // brainstorm — what we're brainstorming about
    bestOf?: number; // rps — 1 | 3 | 5 | 10
    agreementKind?: "LOSER" | "WINNER"; // rps — "Loser has to" / "Winner gets"
    agreementText?: string; // rps — the stakes
    listNodeId?: string; // tasks — the standing team/dept list this activity's tasks feed
    spotlightTaskId?: string; // task review — the task currently focused for the room
    triviaPhase?: "COLLECTING" | "ASSIGNED" | "REVEALED"; // team trivia phase
    triviaDeadline?: string; // team trivia — submission deadline (ISO)
    pollOptions?: string[]; // live poll — the choices
    anonymity?: "NAMED" | "ANON_ROOM" | "ANON_ALL"; // poll — who can see individual votes
    resultsVisibility?: "LIVE" | "AFTER_VOTE" | "HIDDEN"; // poll — when participants see results
    chartType?: "BAR" | "DONUT"; // poll — chart style
    pollCloseAt?: string; // poll — auto-close deadline (ISO)
    pollClosed?: boolean; // poll — voting closed
    maxPerPerson?: number; // word cloud — max submissions per person
    dotOptions?: string[]; // dot voting — the options to prioritize
    dotBudget?: number; // dot voting — dots each person may spend
    deck?: string[]; // planning poker — the cards available
    pokerRevealed?: boolean; // planning poker — votes revealed to the room
    retroColumns?: string[]; // retro board — the column titles (e.g. Start / Stop / Continue)
    checklistItems?: string[]; // checklist / protocol — the items to tick off
    timerEndsAt?: string; // meeting timer — when the running countdown ends (ISO); absent = not running
    timerPausedRemaining?: number; // meeting timer — seconds left while paused
    roundOrder?: string[]; // round-robin — the shuffled speaking order (userIds)
    roundIndex?: number; // round-robin — whose turn it is (index into roundOrder; == length when done)
    scoreboardId?: string; // in-session scoreboard — which standings board to show the room
    tournamentId?: string; // in-session tournament — which bracket to show the room
    fbKind?: string; // feedback review — SUGGESTION | COMPLAINT box being run
    fbScopeKind?: string; // feedback review — ALL | NODE (which box)
    fbScopeId?: string; // feedback review — the node when fbScopeKind is NODE
    fbSpotlight?: number; // feedback review — index of the item the host is focusing the room on (-1 = none)
    teamCount?: number; // team selector — number of teams
    surveyId?: string; // in-meeting survey — which survey to run
    quizId?: string; // live quiz — which quiz to run
    quizPhase?: string; // LOBBY | QUESTION | REVEAL | PODIUM
    quizIdx?: number; // current question index (-1 in lobby)
    quizStartedAt?: string; // when the current question opened (ISO) — for speed scoring
    quizDeadline?: string; // current question close time (ISO)
    closeSeconds?: number; // poll/draft — raw auto-close seconds (turned into pollCloseAt at launch)
    launchAt?: string; // draft — optional scheduled auto-launch time (ISO)
    player1Id?: string; // rps + board games
    player2Id?: string; // rps + board games
    // board games (tic-tac-toe / connect four / checkers) — server-authoritative state
    board?: number[];
    turn?: 1 | 2;
    winner?: 1 | 2 | "TIE" | null;
    lastMove?: number | null;
    mustJumpFrom?: number | null;
  }>(),
  state: text("state").notNull().default("LIVE"), // DRAFT (pre-planned) | LIVE | ENDED
  createdAt: timestamp("created_at").defaultNow().notNull(),
  endedAt: timestamp("ended_at"),
});

// Ordered record of who the randomizer picked (also the history/outcome).
export const activityPicks = pgTable("activity_picks", {
  id: uuid("id").primaryKey().defaultRandom(),
  activityId: uuid("activity_id").notNull().references(() => activities.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  manual: boolean("manual").notNull().default(false), // host chose this person specifically
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Per-session chat, so a session can settle things without a separate meeting.
export const sessionMessages = pgTable("session_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => sessions.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  replyToId: uuid("reply_to_id"), // message this one replies to (self-ref, nullable)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const chatReactions = pgTable(
  "chat_reactions",
  {
    messageId: uuid("message_id").notNull().references(() => sessionMessages.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    emoji: text("emoji").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.messageId, t.userId, t.emoji] }) }),
);

// Per-user read marker for a session's chat (drives the unread badge).
export const sessionChatReads = pgTable(
  "session_chat_reads",
  {
    sessionId: uuid("session_id").notNull().references(() => sessions.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    lastReadAt: timestamp("last_read_at").defaultNow().notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.sessionId, t.userId] }) }),
);

// A persistent, scoped board. `type` defines its content; visible to its scope.
export const boards = pgTable("boards", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  type: text("type").notNull().default("BRAINSTORM"), // NOTICE | BRAINSTORM (more later)
  scopeKind: text("scope_kind").notNull(), // ALL | NODE | GROUP — who can see it
  scopeId: uuid("scope_id"),
  title: text("title").notNull(),
  description: text("description"),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Generic board posts (used by NOTICE now; events/suggestions/etc. extend later).
export const boardPosts = pgTable("board_posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  boardId: uuid("board_id").notNull().references(() => boards.id),
  authorId: uuid("author_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  body: text("body"),
  activeUntil: timestamp("active_until"), // notice expiry; null = no expiry
  pinned: boolean("pinned").notNull().default(false), // pinned notices sort to top + ignore expiry
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const boardPostComments = pgTable("board_post_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  postId: uuid("post_id").notNull().references(() => boardPosts.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Ideas belong to a live brainstorm activity OR a persistent board (exactly one).
export const brainstormIdeas = pgTable("brainstorm_ideas", {
  id: uuid("id").primaryKey().defaultRandom(),
  activityId: uuid("activity_id").references(() => activities.id),
  boardId: uuid("board_id").references(() => boards.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  body: text("body"), // optional explanation
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const brainstormLikes = pgTable(
  "brainstorm_likes",
  {
    ideaId: uuid("idea_id").notNull().references(() => brainstormIdeas.id),
    userId: uuid("user_id").notNull().references(() => users.id),
  },
  (t) => ({ pk: primaryKey({ columns: [t.ideaId, t.userId] }) }),
);

export const brainstormComments = pgTable("brainstorm_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  ideaId: uuid("idea_id").notNull().references(() => brainstormIdeas.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Rock-paper-scissors rounds (best-of-N between two players).
export const rpsRounds = pgTable(
  "rps_rounds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    activityId: uuid("activity_id").notNull().references(() => activities.id),
    roundNo: integer("round_no").notNull(),
    p1Choice: text("p1_choice"), // ROCK | PAPER | SCISSORS
    p2Choice: text("p2_choice"),
    p1Forfeit: boolean("p1_forfeit").notNull().default(false), // didn't lock in before the deadline
    p2Forfeit: boolean("p2_forfeit").notNull().default(false),
    winner: text("winner"), // P1 | P2 | TIE
    deadlineAt: timestamp("deadline_at"), // lock-in deadline; past it, a non-locker forfeits
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({ uniqRound: unique().on(t.activityId, t.roundNo) }), // makes concurrent round-advance safe
);

// Tasks activity: a shared to-do board jotted during a session. status: TODO | DOING | DONE.
export const sessionTasks = pgTable("session_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  activityId: uuid("activity_id").references(() => activities.id), // null = added directly on the team board

  title: text("title").notNull(),
  assigneeId: uuid("assignee_id").references(() => users.id), // who it's for (null = unassigned)
  createdBy: uuid("created_by").notNull().references(() => users.id), // who assigned it
  listNodeId: uuid("list_node_id").references(() => orgNodes.id), // standing team/dept list this feeds
  parentId: uuid("parent_id"), // a subtask points at its parent task (one level); FK added in SQL
  seq: bigserial("seq", { mode: "number" }), // stable per-deployment number for the human key (e.g. MRKT-3)
  dueDate: date("due_date"), // optional, date only
  status: text("status").notNull().default("TODO"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Session agenda: an ordered checklist; activities tie to the currently-active item.
export const agendaItems = pgTable("agenda_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => sessions.id),
  title: text("title").notNull(),
  time: text("time"), // optional start time, e.g. "10:00"
  durationMins: integer("duration_mins"), // optional run time in minutes
  note: text("note"), // optional detail
  position: integer("position").notNull(),
  done: boolean("done").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Live poll (Mentimeter-style): one vote per person per poll; changeable until the poll closes.
export const pollVotes = pgTable(
  "poll_votes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    activityId: uuid("activity_id").notNull().references(() => activities.id),
    optionIndex: integer("option_index").notNull(),
    voterId: uuid("voter_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({ uniqVoter: unique().on(t.activityId, t.voterId) }),
);

// Checklist / protocol run-through — a row exists once an item is ticked (records who + when, for
// accountability: surgical safety checks, deploy runbooks, month-end close, etc.).
export const checklistTicks = pgTable(
  "checklist_ticks",
  {
    activityId: uuid("activity_id").notNull().references(() => activities.id),
    itemIndex: integer("item_index").notNull(),
    checkedBy: uuid("checked_by").notNull().references(() => users.id),
    checkedAt: timestamp("checked_at").defaultNow().notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.activityId, t.itemIndex] }) }),
);

// Retro board — cards in titled columns (Start/Stop/Continue, etc.), upvoted to surface the top points.
export const retroCards = pgTable("retro_cards", {
  id: uuid("id").primaryKey().defaultRandom(),
  activityId: uuid("activity_id").notNull().references(() => activities.id),
  authorId: uuid("author_id").notNull().references(() => users.id),
  column: integer("column").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const retroCardVotes = pgTable(
  "retro_card_votes",
  {
    cardId: uuid("card_id").notNull().references(() => retroCards.id),
    userId: uuid("user_id").notNull().references(() => users.id),
  },
  (t) => ({ pk: primaryKey({ columns: [t.cardId, t.userId] }) }),
);

// Planning Poker — agile estimation. Each person picks a card secretly; the host reveals all at once.
export const pokerVotes = pgTable(
  "poker_votes",
  {
    activityId: uuid("activity_id").notNull().references(() => activities.id),
    voterId: uuid("voter_id").notNull().references(() => users.id),
    card: text("card").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.activityId, t.voterId] }) }),
);

// Fist of Five — a one-tap confidence / temperature check (each person votes 1–5; latest vote wins).
export const fistVotes = pgTable(
  "fist_votes",
  {
    activityId: uuid("activity_id").notNull().references(() => activities.id),
    voterId: uuid("voter_id").notNull().references(() => users.id),
    value: integer("value").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.activityId, t.voterId] }) }),
);

// Dot voting / prioritization — each person spreads a budget of dots across the options.
export const dotVotes = pgTable(
  "dot_votes",
  {
    activityId: uuid("activity_id").notNull().references(() => activities.id),
    voterId: uuid("voter_id").notNull().references(() => users.id),
    optionIndex: integer("option_index").notNull(),
    dots: integer("dots").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.activityId, t.voterId, t.optionIndex] }) }),
);

// Q&A queue (Slido-style) — participants post questions, upvote, host marks answered.
export const qnaQuestions = pgTable("qna_questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  activityId: uuid("activity_id").notNull().references(() => activities.id),
  authorId: uuid("author_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  answered: boolean("answered").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const qnaUpvotes = pgTable(
  "qna_upvotes",
  {
    questionId: uuid("question_id").notNull().references(() => qnaQuestions.id),
    userId: uuid("user_id").notNull().references(() => users.id),
  },
  (t) => ({ pk: primaryKey({ columns: [t.questionId, t.userId] }) }),
);

// Team selector — who's on which team for a TEAM_SELECT activity (random + manual moves).
export const teamAssignments = pgTable(
  "team_assignments",
  {
    activityId: uuid("activity_id").notNull().references(() => activities.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    teamIndex: integer("team_index").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.activityId, t.userId] }) }),
);

// Draw straws — each straw has a hidden length, revealed only when someone draws it.
// One straw per person in the room at launch; whoever draws gets that straw's length.
export const straws = pgTable("straws", {
  id: uuid("id").primaryKey().defaultRandom(),
  activityId: uuid("activity_id").notNull().references(() => activities.id),
  idx: integer("idx").notNull(), // display position in the lineup (shuffled, uncorrelated with length)
  length: integer("length").notNull(), // hidden until drawn; distinct 1..N (1 = shortest)
  pickedBy: uuid("picked_by").references(() => users.id),
  pickedAt: timestamp("picked_at"),
});

// Word cloud submissions — free text, aggregated by frequency. `word` is normalized
// (trimmed + lowercased); the unique key stops one person inflating a single word.
export const wordcloudEntries = pgTable(
  "wordcloud_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    activityId: uuid("activity_id").notNull().references(() => activities.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    word: text("word").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({ uniqWord: unique().on(t.activityId, t.userId, t.word) }),
);

// Team trivia: each participant submits one prompt about themselves; at close it's randomly
// assigned to a teammate to guess aloud; at reveal all answers are shown. format: OPEN | MC.
export const triviaSubmissions = pgTable(
  "trivia_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    activityId: uuid("activity_id").notNull().references(() => activities.id),
    authorId: uuid("author_id").notNull().references(() => users.id),
    format: text("format").notNull(), // OPEN | MC
    prompt: text("prompt").notNull(),
    answer: text("answer"), // OPEN: the true answer (optional, for reveal)
    options: jsonb("options").$type<string[]>(), // MC: the choices
    correctIndex: integer("correct_index"), // MC: index of the right choice
    assignedToId: uuid("assigned_to_id").references(() => users.id), // who guesses it (set at close)
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({ uniqAuthor: unique().on(t.activityId, t.authorId) }), // one submission per person
);

// Repository: useful tidbits/links shared at an org level. Links (and wide scopes) need approval
// from an admin or an appointed approver; whitelisted-domain links and team/dept text auto-publish.
export const repoItems = pgTable("repo_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  nodeId: uuid("node_id").notNull().references(() => orgNodes.id), // target scope (team/dept/div/org)
  kind: text("kind").notNull(), // TEXT | LINK
  category: text("category").notNull().default("GENERAL"), // POLICY|TOOLS|PROTOCOL|MEETING|NEWS|GENERAL (the tabs)
  title: text("title").notNull(),
  url: text("url"), // LINK
  body: text("body"), // description / note (or the text content for a TEXT item)
  itemDate: date("item_date"), // optional relevant date (e.g. a meeting/event/news date)
  domain: text("domain"), // hostname of url, for whitelist checks
  submittedBy: uuid("submitted_by").notNull().references(() => users.id),
  status: text("status").notNull().default("PENDING"), // PENDING | APPROVED | REJECTED
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Appointed approvers for a node — an approver here also covers the node's sub-tree.
export const repoApprovers = pgTable(
  "repo_approvers",
  {
    nodeId: uuid("node_id").notNull().references(() => orgNodes.id),
    userId: uuid("user_id").notNull().references(() => users.id),
  },
  (t) => ({ pk: primaryKey({ columns: [t.nodeId, t.userId] }) }),
);

// Comments on a repository item (visible to anyone who can see the item).
export const repoComments = pgTable("repo_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  itemId: uuid("item_id").notNull().references(() => repoItems.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Whitelisted link domains — links to these skip review.
export const repoDomains = pgTable(
  "repo_domains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    domain: text("domain").notNull(),
  },
  (t) => ({ uniq: unique().on(t.tenantId, t.domain) }),
);

// Append-only log of task changes — drives the "Name M. updated MRKT-3" activity feed.
// Keys are stored as text so the line survives the task being deleted.
export const taskEvents = pgTable("task_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id").notNull().references(() => users.id),
  action: text("action").notNull(), // created | updated | completed | removed
  taskKey: text("task_key").notNull(),
  relatedKey: text("related_key"), // the parent task's key, if this is a subtask
  listNodeId: uuid("list_node_id").references(() => orgNodes.id), // for scoping the feed to your units
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Nomination activity: one vote per participant for who goes next.
export const activityVotes = pgTable(
  "activity_votes",
  {
    activityId: uuid("activity_id").notNull().references(() => activities.id),
    voterId: uuid("voter_id").notNull().references(() => users.id),
    nomineeId: uuid("nominee_id").notNull().references(() => users.id),
  },
  (t) => ({ pk: primaryKey({ columns: [t.activityId, t.voterId] }) }),
);

// Timeline of who joined/left/was removed, for the session log.
export const sessionEvents = pgTable("session_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => sessions.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  kind: text("kind").notNull(), // joined | left | declined | removed
  at: timestamp("at").defaultNow().notNull(),
});

// A bulk "invite a group" action — so it can be reviewed and cancelled as a unit.
export const inviteBatches = pgTable("invite_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => sessions.id),
  scopeLabel: text("scope_label").notNull(), // "Entire org" / dept / group name
  count: integer("count").notNull(),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  cancelledAt: timestamp("cancelled_at"),
  cancelReason: text("cancel_reason"),
});

// Custom groups: committees / squads / ad-hoc teams that don't fit the org tree.
// Many-to-many — a person can be in several groups.
export const groups = pgTable("groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const groupMembers = pgTable(
  "group_members",
  {
    groupId: uuid("group_id").notNull().references(() => groups.id),
    userId: uuid("user_id").notNull().references(() => users.id),
  },
  (t) => ({ pk: primaryKey({ columns: [t.groupId, t.userId] }) }),
);

// Permission groups: capability bundles (distinct from session-audience `groups` above).
// Tenant-admin defines them; users are assigned; each scoped capability carries an org level.
export const permissionGroups = pgTable("permission_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  level: integer("level").notNull().default(1), // rank; higher = more senior. drives defaults + N-approver rule
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// A group inherits all capabilities of its parent groups (live composition, e.g. Director ⊃ Staff).
export const permissionGroupParents = pgTable(
  "permission_group_parents",
  {
    groupId: uuid("group_id").notNull().references(() => permissionGroups.id),
    parentId: uuid("parent_id").notNull().references(() => permissionGroups.id),
  },
  (t) => ({ pk: primaryKey({ columns: [t.groupId, t.parentId] }) }),
);

export const permissionGroupCaps = pgTable(
  "permission_group_caps",
  {
    groupId: uuid("group_id").notNull().references(() => permissionGroups.id),
    capability: text("capability").notNull(),
    scope: text("scope"), // SELF | DEPT | DIVISION | ORG for scoped caps; null for boolean caps
  },
  (t) => ({ pk: primaryKey({ columns: [t.groupId, t.capability] }) }),
);

export const userPermissionGroups = pgTable(
  "user_permission_groups",
  {
    userId: uuid("user_id").notNull().references(() => users.id),
    groupId: uuid("group_id").notNull().references(() => permissionGroups.id),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.groupId] }) }),
);

// Requests & approvals: escalations (join a permission group) and free-form asks (e.g. "pin to org
// board"). Multi-sign — a request needs `requiredApprovals` distinct approvers before it's applied.
export const requests = pgTable("requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  kind: text("kind").notNull(), // PERMISSION_GRANT | GENERIC | SURVEY_EDIT
  subjectUserId: uuid("subject_user_id").references(() => users.id), // who it's for (PERMISSION_GRANT)
  groupId: uuid("group_id").references(() => permissionGroups.id), // requested group
  targetId: uuid("target_id"), // generic target (e.g. the survey for SURVEY_EDIT)
  title: text("title"), // GENERIC description
  status: text("status").notNull().default("PENDING"), // PENDING | APPROVED | REJECTED
  requiredApprovals: integer("required_approvals").notNull().default(1),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const requestApprovals = pgTable(
  "request_approvals",
  {
    requestId: uuid("request_id").notNull().references(() => requests.id),
    approverId: uuid("approver_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.requestId, t.approverId] }) }),
);

// Short-lived password reset tokens (emailed link). Single-use.
export const passwordResets = pgTable("password_resets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Append-only, hash-chained. App role must never UPDATE/DELETE this (enforce in prod grants).
export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  tenantId: uuid("tenant_id"),
  actorId: uuid("actor_id"),
  action: text("action").notNull(),
  meta: jsonb("meta"),
  prevHash: text("prev_hash"),
  hash: text("hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Wellness self check-ins — ANONYMITY-CRITICAL. No user_id, ever; only the submitter's
// department (for k≥5 by-dept aggregates) and a coarse day. Always-on: anyone can check in
// any time, separate from any scheduled pulse survey.
export const wellnessCheckins = pgTable("wellness_checkins", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  nodeId: uuid("node_id"), // the submitter's department/node (NOT identity) — null if unplaced
  stress: integer("stress").notNull(), // 1 = great … 5 = struggling
  note: text("note"), // optional, anonymous; never surfaced individually
  createdDay: date("created_day").notNull(), // coarse, no precise time (defeats timing correlation)
});

// Institution-controlled support content shown on the Wellness page: resources, links, and
// "get help" contacts (email / WhatsApp). NOT anonymity-critical — it's admin-authored content,
// so storing the author is fine. The help contacts are mailto:/wa.me links the person follows
// off-app from their OWN device, so reaching out leaves no identity trail here.
export const wellnessResources = pgTable("wellness_resources", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  title: text("title").notNull(),
  body: text("body"), // supportive blurb / the "risk-free vent" promise
  url: text("url"), // optional info link
  email: text("email"), // optional → renders a "Get help" mailto button
  whatsapp: text("whatsapp"), // optional phone (digits) → renders a WhatsApp button
  published: boolean("published").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Recognition ("big-ups" + official awards): someone celebrates a person, a whole department, or a
// team (group) with a badge + message. ATTRIBUTED by design (the point is to know who praised you).
// `kind` = BIGUP (peer, fun) | AWARD (official, issued by privileged staff). `scopeKind`/`scopeId`
// control who can SEE it (reuses the canSeeScoped spine): ALL = org-wide, NODE = a dept/division,
// GROUP = a team. Recipient is exactly one of toUserId / recipientNodeId / recipientGroupId.
export const recognitions = pgTable("recognitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  fromUserId: uuid("from_user_id").notNull().references(() => users.id),
  kind: text("kind").notNull().default("BIGUP"), // BIGUP | AWARD
  recipientType: text("recipient_type").notNull().default("USER"), // USER | NODE | GROUP
  toUserId: uuid("to_user_id").references(() => users.id), // set when recipientType = USER
  recipientNodeId: uuid("recipient_node_id").references(() => orgNodes.id), // set when NODE
  recipientGroupId: uuid("recipient_group_id").references(() => groups.id), // set when GROUP
  scopeKind: text("scope_kind").notNull().default("NODE"), // ALL | NODE | GROUP — who can see it
  scopeId: uuid("scope_id"), // the node/group for NODE/GROUP visibility
  badge: text("badge").notNull(), // one of a small preset set (see recognition/routes.ts)
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// A light "+1 / star" of support on a recognition. No notification — just visible support.
export const recognitionLikes = pgTable(
  "recognition_likes",
  {
    recognitionId: uuid("recognition_id").notNull().references(() => recognitions.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    anonymous: boolean("anonymous").notNull().default(false), // hide the giver's name (needs recognition.anonymous)
  },
  (t) => ({ pk: primaryKey({ columns: [t.recognitionId, t.userId] }) }),
);

// Per-user "last time I looked at recognition" marker — drives the unread badge for big-ups/awards
// addressed to you (you, your department, or a team you're on). One row per user.
export const recognitionReads = pgTable("recognition_reads", {
  userId: uuid("user_id").primaryKey().references(() => users.id),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

// Short public comments on a recognition (attributed). Anyone in scope can add one.
export const recognitionComments = pgTable("recognition_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  recognitionId: uuid("recognition_id").notNull().references(() => recognitions.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Events / team planning: a planned thing (PLAN), a contribution drive (FUND — goal set now,
// pledges are a later slice), or a spirit/theme day (THEME_DAY — instructions + a photo gallery).
// Visibility reuses the canSeeScoped spine (ALL/NODE/GROUP). Times render in the tenant timezone.
export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  kind: text("kind").notNull().default("PLAN"), // PLAN | FUND | THEME_DAY
  title: text("title").notNull(),
  instructions: text("instructions"), // what to do / the details
  scopeKind: text("scope_kind").notNull().default("NODE"), // ALL | NODE | GROUP — who sees it
  scopeId: uuid("scope_id"),
  startAt: timestamp("start_at", { withTimezone: true }), // optional scheduled date/time
  endAt: timestamp("end_at", { withTimezone: true }),
  goalAmount: integer("goal_amount"), // FUND: target in minor units; contributions land in a later slice
  galleryAnon: boolean("gallery_anon").notNull().default(true), // hide who liked photos (toggleable)
  listId: uuid("list_id").references(() => lists.id), // optional attached list/to-do for the event
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// A photo in an event's gallery. Uniquely numbered per event. URL-based for now (file upload via
// MinIO + a QR phone-upload page is a later slice). `addedBy` distinguishes host vs participant shots.
export const eventPhotos = pgTable(
  "event_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id").notNull().references(() => events.id),
    number: integer("number").notNull(), // unique caption-number within the event
    url: text("url").notNull(),
    caption: text("caption"),
    hidden: boolean("hidden").notNull().default(false), // hidden by a moderator after a report
    addedBy: uuid("added_by").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ uniqNo: unique().on(t.eventId, t.number) }),
);

// Comments on a photo, with one level of replies (parentId). Attributed.
export const eventPhotoComments = pgTable("event_photo_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  photoId: uuid("photo_id").notNull().references(() => eventPhotos.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  parentId: uuid("parent_id"), // null = top-level; else a reply to that comment
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Contributions toward a FUND event's goal. APPEND-ONLY (CLAUDE.md names `contributions`): a recorded
// contribution is immutable — no edits/deletes (enforced by a DB trigger + the restricted role).
// Internal pledge tracker — amounts are minor units; there are no payment rails.
export const eventContributions = pgTable("event_contributions", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  amount: integer("amount").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// A like on a photo. Count is always shown; names are hidden unless the event turns gallery_anon off.
export const eventPhotoLikes = pgTable(
  "event_photo_likes",
  {
    photoId: uuid("photo_id").notNull().references(() => eventPhotos.id),
    userId: uuid("user_id").notNull().references(() => users.id),
  },
  (t) => ({ pk: primaryKey({ columns: [t.photoId, t.userId] }) }),
);

// Marketplace — admins list items people spend points on (perks, real-world rewards, profile bits).
export const marketplaceItems = pgTable("marketplace_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  description: text("description"),
  icon: text("icon"),
  image: text("image"), // optional product image (an /api/uploads/… url); shown instead of the emoji icon
  cost: integer("cost").notNull(),
  stock: integer("stock"), // null = unlimited in stock; a number = limited (decremented on redeem)
  redemptionInfo: text("redemption_info"), // what happens next after buying — who to contact / how to redeem (tickets, etc.)
  kind: text("kind").notNull().default("PERK"), // PERK (real-world/generic) | PROFILE (grants an equippable augment)
  augment: text("augment"), // for PROFILE items: the value the buyer can equip (emoji / title text / colour token)
  augmentKind: text("augment_kind"), // for PROFILE items: which slot — FLAIR | TITLE | COLOR
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Suggestion / complaint box — ANONYMITY-CRITICAL. No user_id is EVER stored on a suggestion: items are
// forced-anonymous. The submitter keeps a one-time client claim ticket; we store only its sha256 hash, so
// they can follow up without us ever knowing who they are. Timestamps are COARSE (created_day) by design.
export const suggestions = pgTable("suggestions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  scopeKind: text("scope_kind").notNull(), // ALL (org box) | NODE (a department's box)
  scopeId: uuid("scope_id"),
  kind: text("kind").notNull().default("SUGGESTION"), // SUGGESTION (public, upvotable) | COMPLAINT (managers only)
  body: text("body").notNull(),
  status: text("status").notNull().default("NEW"), // NEW | REVIEWING | PLANNED | DONE | DECLINED
  category: text("category"), // complaint category (HARASSMENT|PAY|…) — drives routing to the right team
  hidden: boolean("hidden").notNull().default(false), // hidden by a moderator after a report
  urgent: boolean("urgent").notNull().default(false), // submitter-flagged safety/harm concern — escalated, still anonymous
  response: text("response"), // the mandatory reply when an item is planned/done/declined
  claimHash: text("claim_hash").notNull(), // sha256(client ticket) — proves authorship, carries no identity
  createdDay: date("created_day").notNull(), // coarse — never a full timestamp (defeats timing correlation)
  updatedDay: date("updated_day"),
});
// Bug reports / feedback from users. Goes to the workspace (server) admin, who can forward it on to
// the vendor (the product maker). Not anonymous — it's a support channel.
export const bugReports = pgTable("bug_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  reporterId: uuid("reporter_id").notNull().references(() => users.id),
  kind: text("kind").notNull().default("BUG"), // BUG | IDEA
  message: text("message").notNull(),
  page: text("page"), // the route they were on, for context
  status: text("status").notNull().default("NEW"), // NEW | FORWARDED | CLOSED
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  handledBy: uuid("handled_by").references(() => users.id),
  handledAt: timestamp("handled_at", { withTimezone: true }),
});

// Lightweight analytics events — page views (and later interactions) used to compute reach/usage.
// Deliberately coarse (per-surface, per-day) so it never becomes a heavy event pipeline.
export const statsEvents = pgTable("stats_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  userId: uuid("user_id").references(() => users.id), // null = not attributed
  surface: text("surface").notNull(), // top-level area viewed, e.g. "dashboard", "sessions"
  refId: uuid("ref_id"), // optional specific item viewed (a board, survey, shop item…) → per-item reach
  kind: text("kind").notNull().default("VIEW"), // VIEW | INTERACT | LOGIN | LOGIN_FAIL
  day: date("day").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Content reports → moderation queue. Anyone can flag a photo or public suggestion; people with
// content.moderate review and either hide the content or dismiss the report.
export const contentReports = pgTable("content_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  kind: text("kind").notNull(), // PHOTO | SUGGESTION
  refId: uuid("ref_id").notNull(), // the reported content's id
  reporterId: uuid("reporter_id").notNull().references(() => users.id),
  reason: text("reason"),
  status: text("status").notNull().default("OPEN"), // OPEN | ACTIONED | DISMISSED
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedBy: uuid("resolved_by").references(() => users.id),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

// Editable legal documents (Terms of Service, Privacy Policy) per tenant. Bumping the version on any
// edit re-prompts everyone to accept on their next login.
export const legalDocs = pgTable(
  "legal_docs",
  {
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    kind: text("kind").notNull(), // TOS | PRIVACY
    body: text("body").notNull(),
    version: integer("version").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid("updated_by").references(() => users.id),
  },
  (t) => ({ pk: primaryKey({ columns: [t.tenantId, t.kind] }) }),
);
// The latest doc version each user has accepted (re-prompt when the doc's version is newer).
export const legalAcceptances = pgTable(
  "legal_acceptances",
  {
    userId: uuid("user_id").notNull().references(() => users.id),
    kind: text("kind").notNull(),
    version: integer("version").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.kind] }) }),
);

// AI configuration — bring-your-own-key, per tenant. The vendor never pays; each org uses its own
// provider key (stored encrypted at rest). Caps bound token spend. The ONLY place that calls an LLM.
export const aiSettings = pgTable("ai_settings", {
  tenantId: uuid("tenant_id").primaryKey().references(() => tenants.id),
  enabled: boolean("enabled").notNull().default(false),
  provider: text("provider").notNull().default("anthropic"), // anthropic | openai | gemini
  model: text("model").notNull().default("claude-haiku-4-5"),
  apiKeyEnc: text("api_key_enc"), // AES-GCM ciphertext of the org's key — never returned to clients
  weeklyTokenCap: integer("weekly_token_cap").notNull().default(300000), // 0 = unlimited
  perUserDailyCap: integer("per_user_daily_cap").notNull().default(30000), // 0 = unlimited
});

// Append-only usage ledger — one row per AI call. Cost is DERIVED from tokens × the price table
// (so adjusting prices later re-estimates history). Never stores prompt/response content.
export const aiUsage = pgTable("ai_usage", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  userId: uuid("user_id").references(() => users.id), // null for scheduled/system calls
  feature: text("feature").notNull(), // ASSISTANT | INSIGHT | …
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  tokensIn: integer("tokens_in").notNull().default(0),
  tokensOut: integer("tokens_out").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Data-retention schedule (one row per tenant). Disabled by default — destructive purges never run
// until an admin opts in. Audit/ledger tables are deliberately NOT auto-purged (append-only integrity).
export const retentionSettings = pgTable("retention_settings", {
  tenantId: uuid("tenant_id").primaryKey().references(() => tenants.id),
  enabled: boolean("enabled").notNull().default(false),
  complaintsResolvedMonths: integer("complaints_resolved_months").notNull().default(12), // purge resolved suggestions/complaints after N months
  wellnessRawDays: integer("wellness_raw_days").notNull().default(90), // purge raw wellness check-ins after N days
  deactivatedPiiDays: integer("deactivated_pii_days").notNull().default(60), // anonymize a disabled member's PII N days after offboarding
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
});

// Complaint routing: per category, which department's managers should handle it. When a complaint is
// filed under a routed category, its scope is set to that node at submit time → existing manager
// visibility carries it to the right team. Carries no identity (it's org config, not per-complaint).
export const complaintRoutes = pgTable(
  "complaint_routes",
  {
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    category: text("category").notNull(), // HARASSMENT | PAY | WORKLOAD | MANAGEMENT | FACILITIES | SAFETY | OTHER
    targetNodeId: uuid("target_node_id").notNull().references(() => orgNodes.id),
  },
  (t) => ({ pk: primaryKey({ columns: [t.tenantId, t.category] }) }),
);
// "You said → We did" — a public action ledger closing the feedback loop. Leadership records
// what was actually done in response to feedback; everyone in scope can see it. A living record
// (status progresses), so it's editable — changes are audited as a privileged action.
export const actionLedger = pgTable("action_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  scopeKind: text("scope_kind").notNull(), // ALL (org-wide) | NODE (a department)
  scopeId: uuid("scope_id"),
  said: text("said").notNull(), // the feedback / "you said"
  did: text("did").notNull(), // the action taken / "we did"
  status: text("status").notNull().default("COMMITTED"), // COMMITTED | IN_PROGRESS | DONE
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
// Broadcasts — leadership announcements to the org or a department, with optional read/ack
// tracking ("Broadcast & Measure"). The acks table records who acknowledged, so senders see reach.
export const broadcasts = pgTable("broadcasts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  scopeKind: text("scope_kind").notNull(), // ALL | NODE
  scopeId: uuid("scope_id"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  requireAck: boolean("require_ack").notNull().default(false), // pin until each recipient acknowledges
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const broadcastAcks = pgTable(
  "broadcast_acks",
  {
    broadcastId: uuid("broadcast_id").notNull().references(() => broadcasts.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    ackedAt: timestamp("acked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.broadcastId, t.userId] }) }),
);

// Upvotes are an attributed action (anyone may upvote) and reveal nothing about authorship.
export const suggestionVotes = pgTable(
  "suggestion_votes",
  {
    suggestionId: uuid("suggestion_id").notNull().references(() => suggestions.id),
    userId: uuid("user_id").notNull().references(() => users.id),
  },
  (t) => ({ pk: primaryKey({ columns: [t.suggestionId, t.userId] }) }),
);

// Retreat scoreboard — a points standings board for real-world games (cornhole, etc.). Solo or team
// entrants; scorekeepers log points per game; a public QR page shows live standings without login.
export const scoreboards = pgTable("scoreboards", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  title: text("title").notNull(),
  mode: text("mode").notNull().default("SOLO"), // SOLO (individuals) | TEAM (named teams)
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const scoreboardEntrants = pgTable("scoreboard_entrants", {
  id: uuid("id").primaryKey().defaultRandom(),
  scoreboardId: uuid("scoreboard_id").notNull().references(() => scoreboards.id),
  name: text("name").notNull(), // person's name (solo) or team name (team)
  userId: uuid("user_id").references(() => users.id), // linked person for solo entrants (optional)
});
// Retreat groups — people (watchers) who joined a TEAM board and which team they're on. Distinct from
// entrants: in TEAM mode the entrants ARE the teams (scoring units); watchers are the people in them.
export const scoreboardWatchers = pgTable("scoreboard_watchers", {
  id: uuid("id").primaryKey().defaultRandom(),
  scoreboardId: uuid("scoreboard_id").notNull().references(() => scoreboards.id),
  name: text("name").notNull(),
  entrantId: uuid("entrant_id").references(() => scoreboardEntrants.id), // their team (null = unassigned)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const scoreboardScores = pgTable("scoreboard_scores", {
  id: uuid("id").primaryKey().defaultRandom(),
  scoreboardId: uuid("scoreboard_id").notNull().references(() => scoreboards.id),
  entrantId: uuid("entrant_id").notNull().references(() => scoreboardEntrants.id),
  game: text("game").notNull().default(""), // which real-world game these points are from
  points: integer("points").notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// A redemption — the points spend is an append-only points_ledger row; this records what was bought
// (name snapshotted so history survives item deletion) for the person + admin fulfillment.
export const redemptions = pgTable("redemptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  itemId: uuid("item_id").references(() => marketplaceItems.id),
  itemName: text("item_name").notNull(),
  cost: integer("cost").notNull(),
  augment: text("augment"), // snapshot of the granted augment value (so it survives item deletion)
  augmentKind: text("augment_kind"), // snapshot of the augment slot — FLAIR | TITLE | COLOR
  code: text("code"), // the one-time redeemable code handed to this buyer (Starbucks code etc.), if any
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// A pool of one-time redeemable codes for a shop item (gift codes, ticket codes…). Each is handed out
// once on purchase — availability of a code-based item = how many remain unredeemed.
export const marketplaceCodes = pgTable("marketplace_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  itemId: uuid("item_id").notNull().references(() => marketplaceItems.id),
  code: text("code").notNull(),
  redeemedBy: uuid("redeemed_by").references(() => users.id), // null = still available
  redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
});

// Achievements — admin-defined badges earned when a metric crosses a threshold. metric ∈ a fixed
// computable set; period LIFETIME | MONTHLY. Awarded automatically (idempotent) when a user qualifies.
export const achievements = pgTable("achievements", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"), // free-text grouping (e.g. "Engagement", "Competition")
  icon: text("icon"), // an emoji
  metric: text("metric").notNull(), // BIGUPS_RECEIVED | BIGUPS_GIVEN | GAMES_WON | CHECKIN_STREAK | CHECKINS
  threshold: integer("threshold").notNull(),
  period: text("period").notNull().default("LIFETIME"), // LIFETIME | MONTHLY
  scopeKind: text("scope_kind").notNull().default("ALL"), // ALL | NODE | GROUP — who the achievement applies to / is visible to
  scopeId: uuid("scope_id"), // the node/group when scopeKind is NODE/GROUP
  activeFrom: date("active_from"), // optional start of a time-limited challenge (inclusive, YYYY-MM-DD)
  activeUntil: date("active_until"), // optional end of a time-limited challenge (inclusive)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const achievementAwards = pgTable(
  "achievement_awards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    achievementId: uuid("achievement_id").notNull().references(() => achievements.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    periodKey: text("period_key").notNull(), // "lifetime" or "YYYY-MM"
    awardedAt: timestamp("awarded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ uniq: unique().on(t.achievementId, t.userId, t.periodKey) }),
);

// Points ledger — the gamification foundation (CLAUDE.md names `points_ledger` append-only). Every
// earn/spend is an immutable row; a balance is the sum of deltas. Reasons: "checkin", "streak_bonus", …
export const pointsLedger = pgTable("points_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  delta: integer("delta").notNull(), // + earn, − spend
  reason: text("reason").notNull(),
  createdDay: date("created_day").notNull(), // the day it was earned (drives daily-once + streaks)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// A configurable reward on the daily check-in calendar (admins set these). kind: POINTS (auto-credited)
// | PRIZE (real-world, fulfilled offline) | TITLE | PROFILE (a future profile enhancement). One per day.
export const checkinRewards = pgTable(
  "checkin_rewards",
  {
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    day: date("day").notNull(),
    kind: text("kind").notNull(), // POINTS | PRIZE | TITLE | PROFILE
    label: text("label").notNull(),
    points: integer("points").notNull().default(0), // used when kind = POINTS
  },
  (t) => ({ pk: primaryKey({ columns: [t.tenantId, t.day] }) }),
);

// Days a person flagged as leave/sick so a gap doesn't break their check-in streak (loyalty program).
export const pointsLeaveDays = pgTable(
  "points_leave_days",
  {
    userId: uuid("user_id").notNull().references(() => users.id),
    day: date("day").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.day] }) }),
);

// Tournaments — single-elimination brackets for in-house competitions (any game, e.g. checkers, or an
// offline contest). Visibility reuses the canSeeScoped spine. Matches carry an optional scheduled time
// (rendered in the tenant timezone). Results are reported by the organizer (auto-from-activity is later).
export const tournaments = pgTable("tournaments", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  title: text("title").notNull(),
  gameLabel: text("game_label"), // free text — what they're competing at ("Checkers", "Chess", "Quiz")
  scopeKind: text("scope_kind").notNull().default("NODE"), // ALL | NODE | GROUP
  scopeId: uuid("scope_id"),
  status: text("status").notNull().default("ACTIVE"), // SIGNUP (open for entrants) | ACTIVE | DONE
  joinPolicy: text("join_policy").notNull().default("OPEN"), // SIGNUP tournaments: OPEN (just join) | APPLY (organizer approves)
  requirements: text("requirements"), // free text shown to would-be entrants during signup
  rounds: integer("rounds"), // null until the bracket is generated (seeded at start)
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tournamentPlayers = pgTable("tournament_players", {
  id: uuid("id").primaryKey().defaultRandom(),
  tournamentId: uuid("tournament_id").notNull().references(() => tournaments.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  seed: integer("seed").notNull().default(0),
  state: text("state").notNull().default("ACCEPTED"), // APPLIED (awaiting organizer) | ACCEPTED (in the field)
});

export const tournamentMatches = pgTable("tournament_matches", {
  id: uuid("id").primaryKey().defaultRandom(),
  tournamentId: uuid("tournament_id").notNull().references(() => tournaments.id),
  round: integer("round").notNull(),
  slot: integer("slot").notNull(),
  player1Id: uuid("player1_id").references(() => users.id),
  player2Id: uuid("player2_id").references(() => users.id),
  winnerId: uuid("winner_id").references(() => users.id),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  // Rock-Paper-Scissors settle-it: each player's throw (ROCK/PAPER/SCISSORS). When both are in, the
  // winner is computed and advanced; a tie clears both for a replay. Hidden from the opponent until decided.
  p1Throw: text("p1_throw"),
  p2Throw: text("p2_throw"),
});

// Quizzes — Kahoot-style. Reusable templates (a pool): build once, launch as a QUIZ activity
// any number of times. Questions carry the correct answer, optional media, timer, and points.
export const quizzes = pgTable("quizzes", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  title: text("title").notNull(),
  description: text("description"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const quizQuestions = pgTable("quiz_questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  quizId: uuid("quiz_id").notNull().references(() => quizzes.id),
  position: integer("position").notNull(),
  type: text("type").notNull(), // MC | TF | TYPE_ANSWER | PUZZLE | SLIDER
  prompt: text("prompt").notNull(),
  options: jsonb("options").$type<string[]>(), // MC/PUZZLE items; TYPE_ANSWER = accepted answers; TF none
  // correct answer, shape depends on type: MC {indices}, TF {bool}, TYPE_ANSWER {texts},
  // PUZZLE {order}, SLIDER {value, tolerance, min, max}
  correct: jsonb("correct").$type<{ indices?: number[]; bool?: boolean; texts?: string[]; order?: number[]; value?: number; tolerance?: number; min?: number; max?: number }>(),
  timeLimitSec: integer("time_limit_sec").notNull().default(20),
  points: text("points").notNull().default("STANDARD"), // STANDARD | DOUBLE | NONE
  mediaKind: text("media_kind"), // IMAGE | VIDEO | AUDIO
  mediaUrl: text("media_url"),
});

// Live quiz answers — one per player per question, graded on submit (correctness + speed +
// streak). The leaderboard is sum(points) per player; streak is carried for the bonus.
export const quizAnswers = pgTable(
  "quiz_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    activityId: uuid("activity_id").notNull().references(() => activities.id),
    questionId: uuid("question_id").notNull().references(() => quizQuestions.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    answer: jsonb("answer").$type<{ indices?: number[]; bool?: boolean; text?: string; order?: number[]; value?: number }>(),
    correct: boolean("correct").notNull(),
    points: integer("points").notNull().default(0),
    streak: integer("streak").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({ uniq: unique().on(t.activityId, t.questionId, t.userId) }),
);

// Surveys — a form builder + lifecycle. A survey is authored as DRAFT (fully editable),
// then distributed + opened. anonymity is chosen per survey (NAMED stores the respondent;
// ANON stores only a pseudonym_ref + applies k-anonymity — wired in a later slice).
export const surveys = pgTable("surveys", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  title: text("title").notNull(),
  description: text("description"),
  anonymity: text("anonymity").notNull().default("NAMED"), // NAMED | ANON
  perPage: integer("per_page").notNull().default(5),
  status: text("status").notNull().default("DRAFT"), // DRAFT | OPEN | PAUSED | CLOSED
  scopeKind: text("scope_kind"), // distribution: ALL | NODE | GROUP
  scopeId: uuid("scope_id"),
  exclusions: jsonb("exclusions").$type<{ kind: string; id: string }[]>(), // "org-except" — nodes/groups removed from the audience
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Optional grouping for questions. showToTakers=false means it's just a builder-side
// organizer (respondents see a flat list); true means takers see the section heading.
export const surveySections = pgTable("survey_sections", {
  id: uuid("id").primaryKey().defaultRandom(),
  surveyId: uuid("survey_id").notNull().references(() => surveys.id),
  position: integer("position").notNull(),
  title: text("title").notNull(),
  showToTakers: boolean("show_to_takers").notNull().default(true),
});

export const surveyQuestions = pgTable("survey_questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  surveyId: uuid("survey_id").notNull().references(() => surveys.id),
  sectionId: uuid("section_id"), // null = ungrouped; FK added in SQL (avoid ordering issues)
  position: integer("position").notNull(),
  type: text("type").notNull(), // SINGLE | MULTI | TEXT | SCALE
  prompt: text("prompt").notNull(),
  options: jsonb("options").$type<string[]>(), // SINGLE/MULTI choices
  required: boolean("required").notNull().default(false),
  allowOther: boolean("allow_other").notNull().default(false), // SINGLE/MULTI: capture a free-text "Other"
});

// A respondent's progress + submission. NAMED surveys record respondentId; ANON surveys
// record only an opaque pseudonymRef (the client's resume "claim ticket") and NO identity.
// Coarse day-only timestamps (never precise) so anonymous responses can't be time-correlated.
export const surveyResponses = pgTable(
  "survey_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    surveyId: uuid("survey_id").notNull().references(() => surveys.id),
    respondentId: uuid("respondent_id").references(() => users.id), // null for anonymous
    pseudonymRef: text("pseudonym_ref"), // set for anonymous; the client keeps it to resume
    status: text("status").notNull().default("IN_PROGRESS"), // IN_PROGRESS | SUBMITTED
    page: integer("page").notNull().default(0), // resume position
    createdDay: date("created_day").notNull(),
    submittedDay: date("submitted_day"),
  },
  (t) => ({ uniqNamed: unique().on(t.surveyId, t.respondentId) }), // one per user (nulls don't collide → anon unrestricted)
);

export const surveyAnswers = pgTable(
  "survey_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    responseId: uuid("response_id").notNull().references(() => surveyResponses.id),
    questionId: uuid("question_id").notNull().references(() => surveyQuestions.id),
    value: jsonb("value").$type<{ choice?: number; choices?: number[]; text?: string; scale?: number; other?: string }>(),
  },
  (t) => ({ uniqAns: unique().on(t.responseId, t.questionId) }),
);

// Institution-authored insight on a survey: an analysis + whatever the org wants to share
// (solutions, resolutions, next steps). Drafted by the survey owner, then published to the org.
export const surveyInsights = pgTable("survey_insights", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  surveyId: uuid("survey_id").notNull().references(() => surveys.id),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  published: boolean("published").notNull().default(false),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Who else can edit a survey (besides its creator + tenant admins).
export const surveyCollaborators = pgTable(
  "survey_collaborators",
  {
    surveyId: uuid("survey_id").notNull().references(() => surveys.id),
    userId: uuid("user_id").notNull().references(() => users.id),
  },
  (t) => ({ pk: primaryKey({ columns: [t.surveyId, t.userId] }) }),
);

// Builder revision history — "X added Q1", "Y edited Q2", with who + when.
export const surveyEdits = pgTable("survey_edits", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  surveyId: uuid("survey_id").notNull().references(() => surveys.id),
  actorId: uuid("actor_id").notNull().references(() => users.id),
  action: text("action").notNull(),
  detail: text("detail"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Listy — collaborative checklists. A list has a required title; anyone can add items
// and check them on/off. recurrence stores the cadence; auto-reset is a later slice.
export const lists = pgTable("lists", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  title: text("title").notNull(),
  status: text("status").notNull().default("OPEN"), // OPEN | CLOSED
  recurrence: text("recurrence").notNull().default("NONE"), // NONE | DAILY | WEEKLY | QUARTERLY
  scopeKind: text("scope_kind").notNull().default("ALL"), // ALL | NODE | GROUP — who can see it
  scopeId: uuid("scope_id"),
  lastResetAt: timestamp("last_reset_at").defaultNow().notNull(), // for recurring lists (lazy reset on read)
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const listItems = pgTable("list_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  listId: uuid("list_id").notNull().references(() => lists.id),
  text: text("text").notNull(),
  done: boolean("done").notNull().default(false),
  doneBy: uuid("done_by").references(() => users.id),
  doneAt: timestamp("done_at"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Per-list activity log (created / item_added / item_checked / item_unchecked / closed / reopened / reset).
export const listEvents = pgTable("list_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  listId: uuid("list_id").notNull().references(() => lists.id),
  actorId: uuid("actor_id").notNull().references(() => users.id),
  action: text("action").notNull(),
  detail: text("detail"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const listItemComments = pgTable("list_item_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  itemId: uuid("item_id").notNull().references(() => listItems.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// When each user last opened a list → drives "updated since you looked" badges.
export const listReads = pgTable(
  "list_reads",
  {
    listId: uuid("list_id").notNull().references(() => lists.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.listId, t.userId] }) }),
);

// When each user last opened the To-do board → drives the "N task updates" nav badge.
export const taskReads = pgTable("task_reads", {
  userId: uuid("user_id").primaryKey().references(() => users.id),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
});

// When each user last opened their notifications inbox → drives the unread bell count.
// The feed itself is DERIVED at read time from existing tables (gifts in points_ledger,
// recognitions, achievement awards) — no write-everywhere notifications table.
export const notificationReads = pgTable("notification_reads", {
  userId: uuid("user_id").primaryKey().references(() => users.id),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

// Meeting resources attached to a session: a link, image, or video everyone can open
// instantly (no screen-share). URL-based for now; file uploads (MinIO) are a later slice.
export const sessionArtifacts = pgTable("session_artifacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => sessions.id),
  kind: text("kind").notNull(), // LINK | IMAGE | VIDEO | DATA
  title: text("title").notNull(),
  url: text("url"), // set for LINK/IMAGE/VIDEO
  data: text("data"), // set for DATA — pasted CSV/TSV, parsed + charted client-side
  chartType: text("chart_type"), // DATA only: BAR | LINE | DONUT
  addedBy: uuid("added_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
