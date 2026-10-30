/* The interview questions. Copied from second-brain/templates/*.md; the sources behind them are in SOURCES.md.
   Each question: q = the question, why = the framework it comes from, kind = how the answer is stored.
   kind "tags" is not a Q/A pair: it goes into the front matter, like the capture skill does. */
window.TEMPLATES = {
  idea: {
    label: 'Idea',
    blurb: 'Something that came to mind',
    frameworks: 'Getting Things Done capture/clarify (Allen), Lean Startup assumptions and experiments (Ries)',
    questions: [
      { q: "What's the idea? Say it however it comes.", why: 'GTD: capture' },
      { q: 'What triggered it or what problem does it come from?', why: 'GTD: clarify "what is it?"; Lean: problem' },
      { q: 'Who is it for?', why: 'Lean: customer' },
      { q: 'What would success look like?', why: 'GTD: desired outcome' },
      { q: 'What has to be true for this to work, and what are you unsure about?', why: 'Lean: leap-of-faith assumptions' },
      { q: 'What is the smallest thing you could do to test it?', why: 'Lean: smallest experiment; GTD: next action' },
      { q: 'Is this something to act on, keep for someday, or just remember?', why: 'GTD: actionable or not' },
      { q: 'Add tags? (optional)', kind: 'tags' }
    ]
  },
  learning: {
    label: 'Learning',
    blurb: 'Video, podcast, book, article, course, project',
    frameworks: 'Cornell note-taking (Pauk), SQ3R (Robinson), retrieval practice + elaboration (Brown, Roediger & McDaniel)',
    questions: [
      { q: 'What was it? (title, creator, link if any)', why: 'record' },
      { q: 'How long did you spend / how far did you get?', why: 'record' },
      { q: 'Before you started, what did you want from it or what questions did you have?', why: 'SQ3R: Survey/Question' },
      { q: 'Without looking back at it, what were the main points, in your own words?', why: 'retrieval practice; Cornell summary', hint: 'Answer before you look back at anything.' },
      { q: 'What keywords or cues would help you recall this later?', why: 'Cornell cue column' },
      { q: 'How does it connect to something you already know or are doing?', why: 'elaboration' },
      { q: 'What do you disagree with, or still not understand?', why: 'self-testing for gaps' },
      { q: 'Is there anything you want to keep word for word? (quote, number, steps)', why: 'record' },
      { q: 'What will you do with this, and when?', why: 'application; implementation intention' },
      { q: 'Add tags? (optional)', kind: 'tags' }
    ]
  },
  session: {
    label: 'Session',
    blurb: '"I spent 1-2 hrs on..." time block',
    frameworks: 'Deliberate practice (Ericsson), What? / So what? / Now what? (Rolfe et al., after Borton), implementation intentions (Gollwitzer)',
    questions: [
      { q: 'How long was the session, and roughly when?', why: 'record' },
      { q: 'What was the specific goal for this session?', why: 'Ericsson: well-defined goals' },
      { q: 'What did you actually do?', why: 'Rolfe: What?', hint: 'Step by step. Keep going with "then?" until that is all.' },
      { q: 'How focused were you, and what pulled your attention away?', why: 'Ericsson: full focus' },
      { q: 'What was hard or at the edge of what you can do?', why: 'Ericsson: beyond comfort zone' },
      { q: 'What feedback did you get?', why: 'Ericsson: feedback', hint: 'A teacher, a recording, a result, or nothing.' },
      { q: 'So what: what did you notice or learn from it?', why: 'Rolfe: So what?' },
      { q: 'Now what: what is the specific goal for the next session, and when and where will you do it?', why: 'Rolfe: Now what?; Gollwitzer if-then' },
      { q: 'Add tags? (optional)', kind: 'tags' }
    ]
  },
  journal: {
    label: 'Journal',
    blurb: 'Daily review',
    frameworks: 'Three Good Things (Seligman et al.), gratitude (Emmons & McCullough), Seneca\'s evening review, expressive writing (Pennebaker), implementation intentions (Gollwitzer)',
    questions: [
      { q: 'Go through your day: what did you do?', why: 'Seneca: review the day' },
      { q: 'What are three things that went well today, and why did each go well?', why: 'Seligman: Three Good Things' },
      { q: 'What are you grateful for?', why: 'Emmons & McCullough' },
      { q: 'What did you do well, and what would you do differently?', why: 'Seneca: self-review' },
      { q: 'What is on your mind? Write it freely.', why: 'Pennebaker: expressive writing' },
      { q: 'What is one thing you will do tomorrow, and when and where?', why: 'Gollwitzer: if-then plan' }
    ]
  },
  habit: {
    label: 'Habit',
    blurb: 'Set up a habit, or check in on one',
    frameworks: 'Tiny Habits (Fogg), Atomic Habits (Clear), implementation intentions (Gollwitzer), habit formation research (Lally et al.; Wood & Neal)',
    // If the habit was set up in an earlier entry, the app offers to start at this question number (1-based).
    checkInFrom: 6,
    questions: [
      { q: 'What is the habit? Name the specific behaviour.', why: 'Fogg: specific behaviour; Clear: make it obvious' },
      { q: 'Who do you become by doing this?', why: 'Clear: identity-based habits' },
      { q: 'After which existing routine will you do it? ("After I ___, I will ___.")', why: 'Fogg: anchor; Clear: habit stacking' },
      { q: 'Where and when exactly?', why: 'Gollwitzer: if-then plan; Wood & Neal: stable context' },
      { q: 'What is the smallest version you would still do on your worst day?', why: 'Fogg: make it tiny; Clear: two-minute rule' },
      { q: 'Since the last entry, did you do it? What happened?', why: 'record; Clear: habit tracking' },
      { q: "If you didn't, what got in the way: you didn't want to (motivation), it was too hard (ability), or you forgot (prompt)?", why: 'Fogg: B=MAP diagnosis' },
      { q: 'What made it easier, or how did you feel right after doing it?', why: 'Fogg: celebration; Clear: make it satisfying' },
      { q: 'If you miss a day, what will you do the next time?', why: 'Clear: never miss twice; Lally: one miss does not break formation' },
      { q: 'Add tags? (optional)', kind: 'tags' }
    ]
  }
};
