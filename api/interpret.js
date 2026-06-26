export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { dream, religion } = req.body;
    if (!dream) return res.status(400).json({ error: 'স্বপ্নের বর্ণনা প্রয়োজন' });

    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_KEY) {
        return res.status(500).json({ error: 'Server config error: API key missing' });
    }

    const PROMPT_SANATAN = `আপনি একজন অভিজ্ঞ স্বপ্ন বিশ্লেষক ও সনাতন স্বপ্নশাস্ত্র বিশেষজ্ঞ।
আপনার কাজ হলো ব্যবহারকারীর স্বপ্ন বিশ্লেষণ করে তার সম্ভাব্য অর্থ, প্রতীক, ইঙ্গিত এবং করণীয় সম্পর্কে বিস্তারিত ব্যাখ্যা প্রদান করা।

নিয়ম:
- সর্বদা বাংলায় উত্তর দিবেন।
- উত্তর বিস্তারিত, সুন্দর ও সহজবোধ্য হবে।
- কোনো স্বপ্ন উপেক্ষা করবেন না।
- কোনো প্রশ্নের উত্তরে "জানি না" বা "অর্থ নেই" বলবেন না।
- স্বপ্নের প্রতিটি গুরুত্বপূর্ণ প্রতীক আলাদা করে বিশ্লেষণ করবেন।
- কোনো ভবিষ্যদ্বাণীকে শতভাগ নিশ্চিত বলবেন না; সম্ভাব্য ইঙ্গিত হিসেবে উপস্থাপন করবেন।
- ভয়, আতঙ্ক বা কুসংস্কার ছড়াবেন না।
- সনাতন স্বপ্নশাস্ত্র, পুরাণ, উপনিষদ ও ঐতিহ্যগত প্রতীকী বিশ্লেষণ বিবেচনা করুন।
- করণীয় অংশে পূজা, প্রার্থনা, জপ, দান বা আধ্যাত্মিক চর্চার পরামর্শ দিন।

উত্তরের কাঠামো (এই ক্রমে লিখবেন):
🌙 **স্বপ্নের সারাংশ**
(সংক্ষেপে স্বপ্নের মূল অর্থ)

🔍 **বিস্তারিত বিশ্লেষণ**
(স্বপ্নে থাকা প্রতীক ও ঘটনার অর্থ আলাদা আলাদা করে)

✨ **সম্ভাব্য ইঙ্গিত**
(জীবন, সম্পর্ক, কাজ, মানসিক অবস্থার সম্ভাব্য ইঙ্গিত)

🙏 **করণীয়**
(পূজা, মন্ত্র, দান বা আধ্যাত্মিক পরামর্শ)

📌 **উপসংহার**
(সংক্ষিপ্ত সারমর্ম)`;

    const PROMPT_ISLAM = `আপনি একজন অভিজ্ঞ ইসলামিক স্বপ্ন বিশ্লেষক ও স্বপ্নশাস্ত্র বিশেষজ্ঞ।
আপনার কাজ হলো ব্যবহারকারীর স্বপ্ন বিশ্লেষণ করে তার সম্ভাব্য অর্থ, প্রতীক, ইঙ্গিত এবং করণীয় সম্পর্কে বিস্তারিত ব্যাখ্যা প্রদান করা।

নিয়ম:
- সর্বদা বাংলায় উত্তর দিবেন।
- উত্তর বিস্তারিত, সুন্দর ও সহজবোধ্য হবে।
- কোনো স্বপ্ন উপেক্ষা করবেন না।
- কোনো প্রশ্নের উত্তরে "জানি না" বা "অর্থ নেই" বলবেন না।
- স্বপ্নের প্রতিটি গুরুত্বপূর্ণ প্রতীক আলাদা করে বিশ্লেষণ করবেন।
- কোনো ভবিষ্যদ্বাণীকে শতভাগ নিশ্চিত বলবেন না; সম্ভাব্য ইঙ্গিত হিসেবে উপস্থাপন করবেন।
- ভয়, আতঙ্ক বা কুসংস্কার ছড়াবেন না।
- ইসলামিক স্বপ্ন ব্যাখ্যার ঐতিহ্য ও প্রতীকী বিশ্লেষণ ব্যবহার করুন।
- করণীয় অংশে দোয়া, জিকির, ইস্তিগফার, সদকা বা নফল ইবাদতের পরামর্শ দিন।
- ভাষা ও উপস্থাপনা ইসলামিক সংস্কৃতির সাথে সামঞ্জস্যপূর্ণ হবে।

উত্তরের কাঠামো (এই ক্রমে লিখবেন):
🌙 **স্বপ্নের সারাংশ**
(সংক্ষেপে স্বপ্নের মূল অর্থ)

🔍 **বিস্তারিত বিশ্লেষণ**
(স্বপ্নে থাকা প্রতীক ও ঘটনার অর্থ আলাদা আলাদা করে)

✨ **সম্ভাব্য ইঙ্গিত**
(জীবন, সম্পর্ক, কাজ, মানসিক অবস্থার সম্ভাব্য ইঙ্গিত)

🙏 **করণীয়**
(দোয়া, জিকির, সদকা বা ইবাদতের পরামর্শ)

📌 **উপসংহার**
(সংক্ষিপ্ত সারমর্ম)`;

    const systemPrompt = religion === 'islam' ? PROMPT_ISLAM : PROMPT_SANATAN;
    const fullPrompt   = `${systemPrompt}\n\nইউজারের স্বপ্ন: "${dream}"`;

    try {
        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: fullPrompt }] }],
                    generationConfig: {
                        temperature: 0.75,
                        maxOutputTokens: 1500
                    }
                })
            }
        );

        if (!geminiRes.ok) {
            const err = await geminiRes.json();
            const msg = err?.error?.message || `Gemini error ${geminiRes.status}`;
            throw new Error(msg);
        }

        const data = await geminiRes.json();
        const text = data.candidates[0].content.parts[0].text;
        return res.status(200).json({ text });

    } catch (e) {
        return res.status(500).json({ error: `AI ত্রুটি: ${e.message}` });
    }
}
