import { useState } from "react";

import { API_BASE_URL } from "../config.js";

/**
 * Карточка статьи: заголовок, метрики, бейджи технологий, ссылка,
 * кнопка AI-саммари и (опционально) кнопку добавления в избранное.
 */
const ArticleCard = ({ article, isFavorite, onToggleFavorite }) => {
  const [summary, setSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState(false);

  const loadSummary = async () => {
    setLoadingSummary(true);
    setSummaryError(false);

    try {
      const response = await fetch(`${API_BASE_URL}/api/trends/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: article.title,
          url: article.url || null,
        }),
      });

      const data = await response.json();
      setSummary(data.summary || "");

      if (!response.ok || !data.summary) {
        setSummaryError(true);
      }
    } catch (err) {
      console.error("Summary error:", err);
      setSummary("AI is temporarily unavailable");
      setSummaryError(true);
    } finally {
      setLoadingSummary(false);
    }
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <h4 className="font-semibold text-gray-800 dark:text-white mb-2">
            {article.title}
          </h4>

          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
            <span>⭐ {article.score ?? 0}</span>
            <span>💬 {article.descendants ?? 0} comments</span>
            {article.created_at && (
              <span>
                📅{" "}
                {new Date(article.created_at).toLocaleDateString("en-US")}
              </span>
            )}
          </div>

          {article.technologies && article.technologies.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {article.technologies.map((tech, idx) => (
                <span
                  key={idx}
                  className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 text-xs px-2 py-1 rounded"
                >
                  {tech}
                </span>
              ))}
            </div>
          )}

          {/* AI-саммари */}
          <div className="mt-3">
            <button
              type="button"
              onClick={loadSummary}
              disabled={loadingSummary}
              className="inline-flex items-center gap-2 rounded-md border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20 px-3 py-1 text-xs font-medium text-purple-700 dark:text-purple-300 transition hover:bg-purple-100 dark:hover:bg-purple-900/40 disabled:opacity-50"
            >
              <span className={loadingSummary ? "animate-spin" : ""}>✨</span>
              {loadingSummary ? "Generating..." : "AI summary"}
            </button>

            {(summary !== null || summaryError) && (
              <p
                className={`mt-2 text-sm rounded-md border px-3 py-2 ${
                  summaryError
                    ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300"
                    : "border-purple-200 bg-purple-50 text-purple-800 dark:border-purple-800 dark:bg-purple-900/20 dark:text-purple-200"
                }`}
              >
                {summary || "AI is temporarily unavailable"}
              </p>
            )}
          </div>

          {article.url && (
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline text-sm mt-2 mr-4 inline-block"
            >
              Read →
            </a>
          )}
        </div>

        {onToggleFavorite && (
          <button
            type="button"
            onClick={() => onToggleFavorite(article)}
            className="ml-4 text-2xl hover:scale-110 transition p-2"
            title={isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
            {isFavorite ? (
              <span className="text-red-500">❤️</span>
            ) : (
              <span className="text-gray-300 dark:text-gray-600 hover:text-red-400">
                🤍
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  );
};

export default ArticleCard;
