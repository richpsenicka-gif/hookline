// Hookline grading endpoint.
// Runs as a Vercel serverless function at /api/grade
// Calls Google's Gemini API (free tier) to grade a YouTube script.

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const script = (body.script || '').toString();
  const niche = (body.niche || '').toString();

  if (script.trim().length < 20) {
    res.status(400).json({ error: 'Please paste a script that is at least a couple of sentences long.' });
    return;
  }
  if (script.length > 12000) {
    res.status(400).json({ error: 'That script is too long for the free grader (12,000 character limit). Try grading it in sections.' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'The server is missing its GEMINI_API_KEY setting. Add it in your Vercel project settings and redeploy.' });
    return;
  }

  const prompt = buildPrompt(script, niche);

  try {
    const upstream = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=' + apiKey,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.4,
            responseMimeType: 'application/json'
          }
        })
      }
    );

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error('Gemini API error:', upstream.status, errText);
      res.status(502).json({ error: 'The grading service is temporarily unavailable. Please try again in a moment.' });
      return;
    }

    const data = await upstream.json();
    const text =
      data &&
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text;

    if (!text) {
      res.status(502).json({ error: 'The grader returned an unexpected response. Please try again.' });
      return;
    }

    let result;
    try {
      result = JSON.parse(text);
    } catch (e) {
      res.status(502).json({ error: 'The grader returned a response that could not be read. Please try again.' });
      return;
    }

    res.status(200).json(sanitizeResult(result));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong while grading your script.' });
  }
};

function clampScore(n) {
  n = Math.round(Number(n));
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function sanitizeResult(r) {
  r = r || {};
  return {
    overall_score: clampScore(r.overall_score),
    hook_score: clampScore(r.hook_score),
    hook_feedback: String(r.hook_feedback || '').slice(0, 600),
    pacing_score: clampScore(r.pacing_score),
    pacing_feedback: String(r.pacing_feedback || '').slice(0, 600),
    originality_score: clampScore(r.originality_score),
    originality_feedback: String(r.originality_feedback || '').slice(0, 600),
    rewrites: Array.isArray(r.rewrites)
      ? r.rewrites.slice(0, 3).map((x) => ({
          original: String((x && x.original) || '').slice(0, 300),
          improved: String((x && x.improved) || '').slice(0, 300)
        }))
      : [],
    summary: String(r.summary || '').slice(0, 400)
  };
}

function buildPrompt(script, niche) {
  return (
    'You are an expert YouTube retention editor and script doctor who specializes in faceless YouTube channels (no on-camera host — narration over footage, b-roll, or stock visuals).\n\n' +
    'Grade the following video script' + (niche ? ' in the "' + niche + '" niche' : '') + ' and return ONLY a JSON object with exactly this shape — no markdown code fences, no text outside the JSON:\n\n' +
    '{\n' +
    '  "overall_score": <integer 0-100>,\n' +
    '  "hook_score": <integer 0-100>,\n' +
    '  "hook_feedback": "<2-3 sentence critique of the first ~15 seconds specifically, referencing the actual opening lines>",\n' +
    '  "pacing_score": <integer 0-100>,\n' +
    '  "pacing_feedback": "<2-3 sentence critique of structure, pacing, and pattern interrupts>",\n' +
    '  "originality_score": <integer 0-100>,\n' +
    '  "originality_feedback": "<2-3 sentence note on generic or templated phrasing, framed as both a retention issue and a way to stand out from similar channels>",\n' +
    '  "rewrites": [\n' +
    '    {"original": "<a weak line copied exactly from the script>", "improved": "<a rewritten, stronger version>"},\n' +
    '    {"original": "<a weak line copied exactly from the script>", "improved": "<a rewritten, stronger version>"},\n' +
    '    {"original": "<a weak line copied exactly from the script>", "improved": "<a rewritten, stronger version>"}\n' +
    '  ],\n' +
    '  "summary": "<1-2 sentence overall verdict, direct and coach-like>"\n' +
    '}\n\n' +
    'Grading rubric:\n' +
    '- hook_score: does the first ~15 seconds create a specific, concrete curiosity gap or promise, avoid generic openers like "Welcome back to the channel" or "In today\'s video", and earn the next 10 seconds of attention?\n' +
    '- pacing_score: are there long unbroken blocks of narration with no structural turn, visual beat, or pattern interrupt? Does the script drag anywhere?\n' +
    '- originality_score: does the language sound like a template that could be reused for any topic in this niche, or does it sound like it was actually written for this specific video? Flag generic filler phrasing.\n' +
    '- Reference the actual script content in every piece of feedback — never give generic, boilerplate advice.\n' +
    '- Every "original" line in rewrites must be copied exactly from the script provided, not invented.\n\n' +
    'SCRIPT:\n"""\n' + script + '\n"""'
  );
}
