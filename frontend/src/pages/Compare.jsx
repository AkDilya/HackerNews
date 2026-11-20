import { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

import { API_BASE_URL } from "../config.js";

// Должен оставаться синхронным с taxonomy в Explorer.jsx и backend/routers/graph.py
const TECHNOLOGIES = ["AI", "Web", "Python", "Database", "DevOps", "Mobile", "Cloud", "Security", "Hardware"];
const LINE_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#d97706"];

const Compare = () => {
  const [selected, setSelected] = useState(["AI", "Python"]);
  const [days, setDays] = useState(14);
  const [data, setData] = useState(null);
  const [techs, setTechs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const toggleTech = (tech) => {
    setSelected(prev => {
      if (prev.includes(tech)) {
        return prev.filter(t => t !== tech);
      }
      // Максимум 4 технологии — по числу цветов
      return prev.length >= 4 ? prev : [...prev, tech];
    });
  };

  useEffect(() => {
    if (selected.length === 0) {
      setData(null);
      setTechs([]);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    (async () => {
      try {
        const params = new URLSearchParams({ tech: selected.join(","), days: String(days) });
        const response = await fetch(`${API_BASE_URL}/api/trends/compare?${params}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Failed to fetch");
        const result = await response.json();
        setData(Array.isArray(result.data) ? result.data : []);
        setTechs(result.techs || []);
        setError(null);
      } catch (err) {
        if (err.name === "AbortError") return;
        console.error("Compare error:", err);
        setError("Failed to load comparison");
      } finally {
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [selected, days]);

  const totalDaysWithData = data ? data.filter(row => techs.some(t => (row[t] || 0) > 0)).length : 0;

  return (
    <div className="dark:bg-gray-900 min-h-screen">
      <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-2">📈 Technology Comparison</h1>
      <p className="text-gray-500 dark:text-gray-400 mb-6">
        Daily mentions of technologies on one chart — see what is growing faster.
      </p>

      {/* Выбор технологий */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow mb-6">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-sm text-gray-500 dark:text-gray-400 mr-2">
            Selected: {selected.length}/4
          </span>
          {TECHNOLOGIES.map(tech => {
            const isActive = selected.includes(tech);
            return (
              <button
                key={tech}
                type="button"
                onClick={() => toggleTech(tech)}
                disabled={!isActive && selected.length >= 4}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition disabled:opacity-40 ${
                  isActive
                    ? "bg-blue-600 border-blue-600 text-white shadow"
                    : "bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-blue-400"
                }`}
              >
                {tech}
              </button>
            );
          })}
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-white dark:bg-gray-700 text-gray-800 dark:text-white text-sm"
        >
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg">{error}</div>
      )}

      {/* График */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow mb-6">
        {selected.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-10">
            Pick at least one technology to compare.
          </p>
        ) : loading ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-10">Loading...</p>
        ) : totalDaysWithData === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-10">
            No data for this period — try a wider time window.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={380}>
            <LineChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#9ca3af" />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="#9ca3af" />
              <Tooltip
                contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: 8 }}
                labelStyle={{ color: "#f3f4f6" }}
              />
              <Legend />
              {techs.map((tech, idx) => (
                <Line
                  key={tech}
                  type="monotone"
                  dataKey={tech}
                  stroke={LINE_COLORS[idx % LINE_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  activeDot={{ r: 5 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default Compare;
