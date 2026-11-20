import { useState, useEffect } from "react";

import { API_BASE_URL } from "../config.js";

const PIPELINE_STEPS = [
  { icon: "📡", title: "Collect", text: "Every 5 minutes we fetch top stories from the Hacker News Firebase API." },
  { icon: "🧠", title: "Analyze", text: "The LLM (qwen2.5:0.5b via Ollama) extracts technologies and sentiment from titles." },
  { icon: "🗄️", title: "Store", text: "MongoDB: articles, technologies, sentiment; duplicates are rejected by a unique id." },
  { icon: "📊", title: "Visualize", text: "React frontend: dashboard, connections graph, trend explorer." },
];

const FEATURES = [
  { icon: "📈", title: "Technology trends", text: "Mentions, sentiment and daily charts." },
  { icon: "🕸️", title: "Connections graph", text: "Co-mentions and category clusters on vis-network." },
  { icon: "💎", title: "Hidden gems", text: "High score with almost no discussion." },
  { icon: "✨", title: "AI summary", text: "A short article digest one click away." },
  { icon: "🤍", title: "Account", text: "Favorite articles with full CRUD via the API." },
  { icon: "🌙", title: "Dark theme", text: "One-click toggle, preference is persisted." },
];

const TECH_STACK = ["Python", "FastAPI", "MongoDB", "APScheduler", "React 18", "Vite", "Tailwind CSS", "Recharts", "vis-network", "Ollama", "httpx"];

const About = () => {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let cancelled = false;
    // Live counters for the showcase: lightweight public endpoint /api/stats
    fetch(`${API_BASE_URL}/api/stats`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("not ok"))))
      .then((data) => { if (!cancelled) setStats(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="dark:bg-gray-900 min-h-screen">
      <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-2">
        ℹ️ About TrendRadar
      </h1>
      <p className="text-gray-500 dark:text-gray-400 mb-6">
        A technology radar: we collect Hacker News, extract trends and show them live.
      </p>

      {/* Live counters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Articles stored", value: stats?.total_stories },
          { label: "Technologies", value: stats?.total_technologies },
          {
            label: "Last collection",
            value: stats?.last_collection_time
              ? new Date(stats.last_collection_time).toLocaleDateString("en-US")
              : "—",
          },
          { label: "HN articles", value: stats?.sources?.hackernews },
        ].map((item) => (
          <div key={item.label} className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
            <p className="text-sm text-gray-500 dark:text-gray-400">{item.label}</p>
            <p className="text-2xl font-bold text-gray-800 dark:text-white">{item.value ?? "—"}</p>
          </div>
        ))}
      </div>

      {/* Pipeline */}
      <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">
        🔄 How it works
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        {PIPELINE_STEPS.map((step, idx) => (
          <div
            key={step.title}
            className="relative bg-white dark:bg-gray-800 p-5 rounded-lg shadow border-t-4 border-blue-500 dark:border-blue-400"
          >
            <span className="absolute top-3 right-4 text-xs font-bold text-gray-300 dark:text-gray-600">
              0{idx + 1}
            </span>
            <p className="text-3xl mb-2">{step.icon}</p>
            <h3 className="font-semibold text-gray-800 dark:text-white mb-1">{step.title}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{step.text}</p>
          </div>
        ))}
      </div>

      {/* Features */}
      <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">
        🎯 What it does
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {FEATURES.map((feature) => (
          <div key={feature.title} className="bg-white dark:bg-gray-800 p-5 rounded-lg shadow hover:shadow-md transition">
            <p className="text-2xl mb-2">{feature.icon}</p>
            <h3 className="font-semibold text-gray-800 dark:text-white mb-1">{feature.title}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{feature.text}</p>
          </div>
        ))}
      </div>

      {/* Stack */}
      <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">
        🛠 Tech stack
      </h2>
      <div className="flex flex-wrap gap-2 mb-8">
        {TECH_STACK.map((tech) => (
          <span
            key={tech}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm px-3 py-1 rounded-full shadow-sm"
          >
            {tech}
          </span>
        ))}
      </div>

      <p className="text-gray-500 dark:text-gray-400 text-sm">
        Built for the Big Data & AI course • 2026
      </p>
    </div>
  );
};

export default About;
