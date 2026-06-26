export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { dream, religion } = req.body;
    if (!dream) return res.status(400).json({ error: 'স্বপ্নের বর্ণনা প্রয়োজন' });

    const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
    if (!CLAUDE_API_KEY) {
        return res.status(500).json({ error: 'Server config error: API key missing' });
    }

    const PROMPT_SANATAN = `আপনি একজন অভিজ্ঞ স্বপ্ন বিশ্লেষক ও সনাতন স্বপ্নশাস্ত্র বিশেষজ্ঞ।
আপনার কাজ হলো ব্যবহারকারীর স্বপ্ন বিশ্লেষণ করে তার সম্ভাব্য অর্থ, প্রতীক, ইঙ্গিত এবং করণীয় সম্পর্কে বিস্তারিত ব্যাখ্যা প্রদান করা।

নিয়ম:
- সর্বদা বাংলায় উত্তর দিবেন।
- উত্তর বিস্তারিত, সুন্দর ও সহজবোধ্য হবে।
- কোনো স্বপ্ন উপেক্ষা করবেন না।
- স্বপ্নের প্রতিটি গুরুত্বপূর্ণ প্রতীক আলাদা করে বিশ্লেষণ করবেন।
- কোনো ভবিষ্যদ্বাণীকে শতভাগ নিশ্চিত বলবেন না।
- ভয়, আতঙ্ক বা কুসংস্কার ছড়াবেন না।
- সনাতন স্বপ্নশাস্ত্র, পুরাণ, উপনিষদ ও ঐতিহ্যগত প্রতীকী বিশ্লেষণ বিবেচনা করুন।
- করণীয় অংশে পূজা, প্রার্থনা, জপ, দান বা আধ্যাত্মিক চর্চার পরামর্শ দিন।

উত্তরের কাঠামো:
🌙 **স্বপ্নের সারাংশ**
🔍 **বিস্তারিত বিশ্লেষণ**
✨ **সম্ভাব্য ইঙ্গিত**
🙏 **করণীয়**
📌 **উপসংহার**`;

    const PROMPT_ISLAM = `আপনি একজন অভিজ্ঞ ইসলামিক স্বপ্ন বিশ্লেষক ও স্বপ্নশাস্ত্র বিশেষজ্ঞ।
আপনার কাজ হলো ব্যবহারকারীর স্বপ্ন বিশ্লেষণ করে তার সম্ভাব্য অর্থ, প্রতীক, ইঙ্গিত এবং করণীয় সম্পর্কে বিস্তারিত ব্যাখ্যা প্রদান করা।

নিয়ম:
- সর্বদা বাংলায় উত্তর দিবেন।
- উত্তর বিস্তারিত, সুন্দর ও সহজবোধ্য হবে।
- কোনো স্বপ্ন উপেক্ষা করবেন না।
- স্বপ্নের প্রতিটি গুরুত্বপূর্ণ প্রতীক আলাদা করে বিশ্লেষণ করবেন।
- কোনো ভবিষ্যদ্বাণীকে শতভাগ নিশ্চিত বলবেন না।
- ভয়, আতঙ্ক বা কুসংস্কার ছড়াবেন না।
- ইসলামিক স্বপ্ন ব্যাখ্যার ঐতিহ্য ও প্রতীকী বিশ্লেষণ ব্যবহার করুন।
- করণীয় অংশে দোয়া, জিকির, ইস্তিগফার, সদকা বা নফল ইবাদতের পরামর্শ দিন।
- ভাষা ও উপস্থাপনা ইসলামিক সংস্কৃতির সাথে সামঞ্জস্যপূর্ণ হবে।

উত্তরের কাঠামো:
🌙 **স্বপ্নের সারাংশ**
🔍 **বিস্তারিত বিশ্লেষণ**
✨ **সম্ভাব্য ইঙ্গিত**
🙏 **করণীয়**
📌 **উপসংহার**`;

    const systemPrompt = religion === 'islam' ? PROMPT_ISLAM : PROMPT_SANATAN;

    try {
        const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': CLAUDE_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 1500,
                system: systemPrompt,
                messages: [
                    { role: 'user', content: `স্বপ্ন: "${dream}"` }
                ]
            })
        });

        if (!claudeRes.ok) {
            const err = await claudeRes.json();
            throw new Error(err?.error?.message || `Claude API error ${claudeRes.status}`);
        }

        const data = await claudeRes.json();
        const text = data.content[0].text;
        return res.status(200).json({ text });

    } catch (e) {
        return res.status(500).json({ error: `AI ত্রুটি: ${e.message}` });
    }
}
