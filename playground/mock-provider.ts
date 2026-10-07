import type { Provider } from '../src/server'

// Fake LLM for the playground. Picks an answer by keywords so you can try every
// renderer feature without an API key. Real answers: set ANTHROPIC_API_KEY or OPENAI_API_KEY.

const clean = (q: string) => q.replace(/[*_`#>|[\]]/g, '').trim()
const topicOf = (q: string) =>
  clean(q)
    .replace(
      /^(what|who|why|how|explain|tell me about|describe|define)\b( is| are| does| do)?\s*/i,
      '',
    )
    .replace(/[?.!]+$/, '') || 'that'

type Rule = { test: RegExp; answer: (q: string) => string }

const rules: Rule[] = [
  {
    test: /^(hi|hello|hey|yo|hola|namaste|good (morning|evening|afternoon))\b/i,
    answer: () => `Hey! 👋 I'm the **demo assistant** running on a mock AI, so no API key is needed.

Try asking me for:
- **code**, e.g. "write a debounce function in JavaScript"
- **a table**, e.g. "compare React vs Vue"
- **steps**, e.g. "how do I deploy to Vercel"
- **a long answer**. Then refresh mid-stream and watch it recover.`,
  },
  {
    test: /\b(compare|comparison|vs\.?|versus|table|difference|differences)\b/i,
    answer: (q) => {
      const [a = 'Option A', b = 'Option B'] = clean(q)
        .replace(/^.*?(compare|difference(s)? between)\s*/i, '')
        .split(/\s+(?:vs\.?|versus|and|or)\s+/i)
        .map((s) => s.replace(/[?.!]+$/, '').trim())
        .filter(Boolean)
      return `Here's a quick comparison of **${a}** and **${b}**:

| | ${a} | ${b} |
|:--|:--|:--|
| Learning curve | Moderate | Gentle |
| Ecosystem | Huge | Large |
| Performance | Excellent | Excellent |
| Best for | Large apps, big teams | Fast prototyping |

**Bottom line:** both are solid. Pick the one your team already knows.`
    },
  },
  {
    test: /\b(long|essay|story|detailed|everything|in depth)\b/i,
    answer: () =>
      Array.from(
        { length: 8 },
        (_, i) => `### Part ${i + 1}

This is a long answer so you can test **scrolling**, the **stop** button, and **refreshing mid-stream**. Paragraph ${i + 1} of 8 covers one more idea, with some \`inline code\` and a [link](https://example.com).`,
      ).join('\n\n'),
  },
  {
    test: /\b(code|function|javascript|typescript|js|ts|python|react|component|snippet|regex|sql)\b/i,
    answer: (q) => {
      const py = /python/i.test(q)
      const sql = /sql/i.test(q)
      const lang = py ? 'python' : sql ? 'sql' : 'ts'
      const code = py
        ? 'def debounce(fn, wait):\n    import threading\n    timer = None\n    def wrapped(*args, **kwargs):\n        nonlocal timer\n        if timer:\n            timer.cancel()\n        timer = threading.Timer(wait, lambda: fn(*args, **kwargs))\n        timer.start()\n    return wrapped'
        : sql
          ? "SELECT user_id, COUNT(*) AS messages\nFROM chat_messages\nWHERE created_at > NOW() - INTERVAL '7 days'\nGROUP BY user_id\nORDER BY messages DESC\nLIMIT 10;"
          : 'export function debounce<T extends (...args: any[]) => void>(fn: T, wait = 300) {\n  let timer: ReturnType<typeof setTimeout> | undefined\n  return (...args: Parameters<T>) => {\n    clearTimeout(timer)\n    timer = setTimeout(() => fn(...args), wait)\n  }\n}'
      return `Here's a clean way to do it in **${py ? 'Python' : sql ? 'SQL' : 'TypeScript'}**:

\`\`\`${lang}
${code}
\`\`\`

**How it works**
1. Each call resets the timer.
2. The function runs only after \`wait\` ms of silence.
3. Use it for search inputs, resize handlers and autosave.

> Tip: hover the code block and press **Copy**.`
    },
  },
  {
    test: /\b(how (do|to|can)|steps|guide|setup|set up|install|deploy|tutorial)\b/i,
    answer: (q) => `Sure, here's how to **${topicOf(q).replace(/^(i|we|you)\s+/i, '')}**:

1. **Prepare.** Make sure Node 18+ is installed.
   - Check with \`node -v\`
2. **Install** dependencies:
   \`\`\`bash
   npm install
   \`\`\`
3. **Configure** your environment variables in \`.env\`.
4. **Run** it locally with \`npm run dev\`.
5. **Ship it** 🚀

Need more detail on any step? Just ask.`,
  },
  {
    test: /\b(markdown|demo|features?|show me)\b/i,
    answer: () => `This widget renders **markdown** while it streams:

- *Italic*, **bold**, ~~strike~~ and \`inline code\`
- Links: https://www.npmjs.com
- Nested lists
  - like this one

\`\`\`ts
import { Chatbot } from '@gomisarita/persistent-chatbot/react'
\`\`\`

| Feature | Status |
|:--|:-:|
| Survives refresh | ✅ |
| Streaming | ✅ |
| Safe markdown | ✅ |
| Key stays on server | ✅ |`,
  },
]

const generic = [
  (t: string) =>
    `Good question about **${t}**. In short, it depends on your goals, but here's how I'd think about it:

- **Start simple.** Get something working end to end.
- **Measure.** Find the real bottleneck before optimizing.
- **Iterate.** Small, frequent improvements win.

Want me to go deeper on any of these?`,
  (t: string) =>
    `Here's a quick overview of **${t}**:

> ${t.charAt(0).toUpperCase() + t.slice(1)} is best understood by looking at *what problem it solves* and *what trade-offs it makes*.

1. **What it is:** the core idea in one sentence.
2. **Why it matters:** what you gain from it.
3. **When to avoid it:** cases where something simpler works better.

_(Demo answer from the mock AI. Add an API key for real answers.)_`,
  (t: string) =>
    `Let me break down **${t}**:

| Aspect | Notes |
|:--|:--|
| Difficulty | Beginner friendly |
| Time to learn | A weekend |
| Useful for | Most web projects |

Anything specific you'd like to know?`,
]

const pick = (q: string) => {
  const rule = rules.find((r) => r.test.test(q))
  if (rule) return rule.answer(q)
  let h = 0
  for (const c of q) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return (generic[h % generic.length] as (t: string) => string)(topicOf(q))
}

/** Streams the chosen answer word by word, like a real model. */
export const mockProvider: Provider = async function* ({ messages, signal }) {
  const answer = pick(messages[messages.length - 1]?.content ?? '')
  await new Promise((r) => setTimeout(r, 350)) // "thinking"
  for (const part of answer.split(/(?<=\s)/)) {
    if (signal.aborted) return
    await new Promise((r) => setTimeout(r, 18 + Math.random() * 30))
    yield part
  }
}
