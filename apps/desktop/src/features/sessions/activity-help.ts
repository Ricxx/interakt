import type { Help } from "../../ui/info-tip";

// Mini "how to use it" explainers for every activity — surfaced via the ? icon in the launcher and on
// the running activity. Keep each blurb to one line and steps to 2–3 short actions.
export const ACTIVITY_HELP: Record<string, Help> = {
  RANDOMIZER: { blurb: "Pick people at random from the room — fair and visible.", steps: ["Optionally remove people after they're picked, or include the host.", "Tap Pick, or choose someone manually.", "Picked names are listed so nobody's drawn twice."] },
  NOMINATION: { blurb: "Let the room vote for who goes next.", steps: ["Everyone taps the person they nominate.", "Tallies update live (anonymous unless the host shows names).", "An optional timer closes voting."] },
  BRAINSTORM: { blurb: "Collect ideas on a topic, then like and discuss.", steps: ["The title or description is the prompt.", "Anyone adds ideas; others like and comment.", "Sort by likes to surface the best."] },
  RPS: { blurb: "Settle something with Rock-Paper-Scissors.", steps: ["Pick the two players and best-of-N.", "Each throws ✊ ✋ ✌ each round.", "First to the majority wins."] },
  TIC_TAC_TOE: { blurb: "Classic 3×3 — two players.", steps: ["Pick the two players.", "Take turns tapping a square.", "Three in a row wins."] },
  CONNECT_FOUR: { blurb: "Drop discs and connect four — two players.", steps: ["Pick the two players.", "Take turns dropping a disc into a column.", "Four in a row (any direction) wins."] },
  CHECKERS: { blurb: "Capture all the pieces — two players.", steps: ["Pick the two players.", "Move diagonally; jump to capture.", "Take all the opponent's pieces to win."] },
  TASK_REVIEW: { blurb: "Spotlight a task for the room and track it live.", steps: ["Pick the task to focus on.", "Add or tick subtasks as you discuss.", "Everyone sees progress in real time."] },
  TASKS: { blurb: "Capture tasks for the team during the meeting.", steps: ["Add tasks as they come up.", "Assign owners and tick them off.", "They feed the team's standing list."] },
  TRIVIA: { blurb: "Everyone submits a fact; the room guesses whose it is.", steps: ["Each person submits a fact about themselves.", "Facts are dealt out anonymously.", "Guess who — points for correct guesses."] },
  POLL: { blurb: "Poll the room with a live chart.", steps: ["Vote for an option.", "Results show live, after you vote, or on close (host's choice).", "Host can close voting and export a CSV."] },
  QNA: { blurb: "Ask questions and upvote the ones you want answered.", steps: ["Type a question and tap Ask.", "Upvote others' questions to push them up.", "The host marks each one answered."] },
  DOT_VOTE: { blurb: "Prioritize by spending a budget of dots.", steps: ["You get a set number of dots.", "Spend them across options with − / + (stack several on one if you like).", "The most-dotted option leads."] },
  FIST: { blurb: "Quick 1–5 confidence / temperature check.", steps: ["Tap 1 (no confidence) to 5 (fully on board).", "Change your vote any time.", "The room average and spread update live."] },
  POKER: { blurb: "Estimate together without anchoring each other.", steps: ["Everyone picks a card secretly (1, 2, 3, 5, 8, 13, 21, ?).", "The host reveals all cards at once.", "Discuss the spread, then re-estimate if needed."] },
  RETRO: { blurb: "Structured reflection — capture what to change, then prioritize.", steps: ["Pick a column layout (e.g. Start / Stop / Continue).", "Everyone adds cards under each column.", "Upvote the points that matter; top ones rise."] },
  CHECKLIST: { blurb: "Run a protocol or runbook live — tick items off as a team.", steps: ["Host pastes the checklist (one item per line).", "Anyone taps an item to tick it; it records who.", "Progress bar fills; host can reset to re-run."] },
  TIMER: { blurb: "A shared countdown to timebox a topic or speaker.", steps: ["Pick a duration and tap Start.", "The whole room sees it count down (turns red near the end).", "Host can pause, resume, restart, or reset."] },
  ROUNDROBIN: { blurb: "A fair, shuffled turn order — great for stand-ups and check-ins.", steps: ["Launches with everyone in the room in a random order.", "Whoever's up speaks; they tap “I'm done” (or the host taps Next).", "Host can go back or reshuffle to include late arrivals."] },
  SCOREBOARD: { blurb: "Show a real-world points scoreboard's standings to the whole room.", steps: ["Pick one of your scoreboards (built under Scoreboards).", "The room watches the live medal standings.", "Record points right here, or open the full board."] },
  TOURNAMENT: { blurb: "Watch a tournament bracket live on the shared screen.", steps: ["Pick one of your tournaments (built under Tournaments).", "The room sees the bracket update as matches are decided.", "Open the full tournament to report results."] },
  FEEDBACK: { blurb: "Surface the team's top issues from the anonymous box, objectively.", steps: ["Pick the box: suggestions or complaints, org-wide or a department.", "Start a timed vote — everyone upvotes what matters (anonymously).", "When the timer ends, items are ranked top-down to tackle."] },
  WORDCLOUD: { blurb: "Words grow larger as more people say them.", steps: ["Submit a word or two for the prompt.", "Repeated words grow bigger.", "Great for one-word check-ins."] },
  DRAW_STRAWS: { blurb: "Random 'who's it' with a straw pull.", steps: ["Everyone draws a straw.", "Lengths stay hidden until drawn.", "Shortest straw is picked."] },
  TEAM_SELECT: { blurb: "Split the room into teams.", steps: ["Choose how many teams.", "Members are placed at random.", "Nudge anyone to balance, or reshuffle."] },
  SURVEY: { blurb: "Run one of your surveys live in the meeting.", steps: ["Pick a survey you've built.", "Participants answer on their screens.", "Responses feed the survey's results."] },
  QUIZ: { blurb: "Kahoot-style timed, scored quiz.", steps: ["Pick a quiz you've built.", "Each question is timed; faster correct answers score more.", "A live leaderboard shows the standings."] },
};
