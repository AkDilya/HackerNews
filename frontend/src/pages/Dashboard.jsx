import { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import ArticleCard from "../components/ArticleCard.jsx";
import { useAuth } from "../context/AuthContext.jsx";

import { API_BASE_URL } from "../config.js";

// Красивый спиннер
const Spinner = () => (
  <div className="flex justify-center items-center p-12">
    <div className="relative">
      <div className="h-12 w-12 rounded-full border-4 border-gray-200 dark:border-gray-700"></div>
      <div className="absolute top-0 left-0 h-12 w-12 rounded-full border-4 border-blue-600 border-t-transparent animate-spin"></div>
    </div>
  </div>
);

// Skeleton-заглушка
const SkeletonCard = () => (
  <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow animate-pulse">
    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-3"></div>
    <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
  </div>
);

const Dashboard = () => {
  const { authFetch, authenticated } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [totalEvents, setTotalEvents] = useState(0);
  const [topTech, setTopTech] = useState("—");
  const [topTechCount, setTopTechCount] = useState(0);
  const [sentiment, setSentiment] = useState({ positive: 0, neutral: 100, negative: 0 });
  const [timeline, setTimeline] = useState([]);
  const [articles, setArticles] = useState([]);
  const [selectedTech, setSelectedTech] = useState("AI");
  const [refreshing, setRefreshing] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState(new Set());
  const [hiddenGems, setHiddenGems] = useState([]);
  const [loadingGems, setLoadingGems] = useState(true);
  const [feed, setFeed] = useState(null); // null = не загружался, {personalized, items}

  const loadFeed = async () => {
    if (!authenticated) {
      setFeed(null);
      return;
    }
    try {
      const response = await authFetch(`${API_BASE_URL}/api/feed?limit=5`);
      if (response.status === 401) return; // токен протух — ленту просто не показываем
      if (!response.ok) throw new Error("Failed to fetch feed");
      const data = await response.json();
      const items = Array.isArray(data.items) ? data.items : [];
      setFeed({ personalized: data.personalized, items });

      // Сердечки для статей ленты: докидываем проверки в общий набор
      if (items.length > 0) {
        const favChecks = await Promise.all(
          items.map(async (article) => {
            try {
              const res = await authFetch(`${API_BASE_URL}/api/favorites/check/${article.id}`);
              const fav = await res.json();
              return { id: article.id, isFavorite: fav.is_favorite };
            } catch {
              return { id: article.id, isFavorite: false };
            }
          })
        );
        setFavoriteIds(prev => {
          const next = new Set(prev);
          favChecks.filter(f => f.isFavorite).forEach(f => next.add(f.id));
          return next;
        });
      }
    } catch (err) {
      console.error("Feed error:", err);
      setFeed({ personalized: false, items: [] });
    }
  };

  const loadHiddenGems = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/trends/hidden-gems`);
      if (!response.ok) throw new Error("Failed to fetch hidden gems");
      const gems = await response.json();
      setHiddenGems(Array.isArray(gems) ? gems : []);
    } catch (err) {
      console.error("Hidden gems error:", err);
      setHiddenGems([]);
    } finally {
      setLoadingGems(false);
    }
  };

  const loadData = async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/trends/summary`);
      if (!response.ok) throw new Error("Failed to fetch");
      const data = await response.json();
      
      setTotalEvents(data.total_count || 0);
      setTopTech(data.top_tech || "—");
      setTopTechCount(data.top_tech_count || 0);
      setSentiment(data.sentiment || { positive: 0, neutral: 100, negative: 0 });
      
      if (data.top_tech) {
        setSelectedTech(data.top_tech);
        await loadTimeline(data.top_tech);
        await loadArticles(data.top_tech);
      }
      setError(null);
    } catch (err) {
      console.error("Dashboard error:", err);
      setError("Failed to load data. Check if FastAPI (uvicorn) is running.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadTimeline = async (tech) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/trends/${tech}/timeline`);
      if (!response.ok) throw new Error("Failed to fetch timeline");
      setTimeline(await response.json());
    } catch (err) {
      console.error("Timeline error:", err);
    }
  };

  const loadArticles = async (tech) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/trends/${tech}/articles?limit=5`);
      if (!response.ok) throw new Error("Failed to fetch articles");
      const articlesData = await response.json();
      setArticles(articlesData);
      
      // Проверяем избранные статьи
      const favChecks = await Promise.all(
        articlesData.map(async (article) => {
          try {
            const res = await authFetch(`${API_BASE_URL}/api/favorites/check/${article.id}`);
            const data = await res.json();
            return { id: article.id, isFavorite: data.is_favorite };
          } catch {
            return { id: article.id, isFavorite: false };
          }
        })
      );
      
      const favSet = new Set(favChecks.filter(f => f.isFavorite).map(f => f.id));
      setFavoriteIds(favSet);
    } catch (err) {
      console.error("Articles error:", err);
    }
  };

  const handleTechChange = async (e) => {
    const tech = e.target.value;
    setSelectedTech(tech);
    await loadTimeline(tech);
    await loadArticles(tech);
  };

  const toggleFavorite = async (article) => {
    const isFavorite = favoriteIds.has(article.id);

    try {
      if (isFavorite) {
        const response = await authFetch(`${API_BASE_URL}/api/favorites/${article.id}`, { method: "DELETE" });
        if (!response.ok && response.status !== 404) throw new Error("Failed to remove");
        setFavoriteIds(prev => {
          const next = new Set(prev);
          next.delete(article.id);
          return next;
        });
      } else {
        const response = await authFetch(`${API_BASE_URL}/api/favorites`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            article_id: article.id,
            title: article.title,
            url: article.url,
            score: article.score,
            technologies: article.technologies || [],
          }),
        });
        if (!response.ok) throw new Error("Failed to add");
        setFavoriteIds(prev => new Set([...prev, article.id]));
      }
    } catch (err) {
      console.error("Favorite error:", err);
    }
  };

  const exportCSV = () => {
    const headers = ["Title", "Score", "Comments", "Date", "URL", "Technologies"];
    const rows = articles.map(a => [
      `"${a.title.replace(/"/g, '""')}"`,
      a.score,
      a.descendants,
      new Date(a.created_at).toLocaleDateString("en-US"),
      a.url || "",
      `"${(a.technologies || []).join(', ')}"`
    ]);
    
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `trendradar_${selectedTech}_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => { loadData(); loadHiddenGems(); loadFeed(); }, [authenticated]);

  if (loading) return <Spinner />;

  return (
    <div className="dark:bg-gray-900 min-h-screen">
      {/* Шапка с кнопками */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-2">
            TrendRadar Dashboard
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            {new Date().toLocaleDateString("en-US", { 
              weekday: "long", 
              year: "numeric", 
              month: "long", 
              day: "numeric" 
            })}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition text-gray-700 dark:text-gray-200"
          >
            <span className={refreshing ? "animate-spin" : ""}>🔄</span>
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            📥 Export CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg">
          {error}
        </div>
      )}

      {/* Карточки статистики */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
              <h3 className="text-sm text-gray-500 dark:text-gray-400 mb-2">Total Events</h3>
              <p className="text-3xl font-bold text-gray-800 dark:text-white">{totalEvents}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
              <h3 className="text-sm text-gray-500 dark:text-gray-400 mb-2">Top Technology</h3>
              <p className="text-3xl font-bold text-gray-800 dark:text-white">{topTech}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{topTechCount} mentions</p>
            </div>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
              <h3 className="text-sm text-gray-500 dark:text-gray-400 mb-2">Sentiment Overview</h3>
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-green-600 dark:text-green-400">Positive</span>
                  <span className="font-semibold text-gray-800 dark:text-white">{sentiment.positive}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Neutral</span>
                  <span className="font-semibold text-gray-800 dark:text-white">{sentiment.neutral}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-red-600 dark:text-red-400">Negative</span>
                  <span className="font-semibold text-gray-800 dark:text-white">{sentiment.negative}%</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Скрытые жемчужины */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow mb-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
            💎 Hidden Gems
          </h3>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            score &gt; 100 · comments &lt; 5
          </span>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {loadingGems
            ? "Loading hidden gems..."
            : hiddenGems.length === 0
              ? "Nothing found yet: we need articles with a score > 100 and fewer than 5 comments."
              : "High score with almost no discussion — underrated material."}
        </p>

        {hiddenGems.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 dark:border-gray-700 p-6 text-center">
            <p className="text-4xl mb-2">🫧</p>
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              No gems yet — the collector has not found such articles so far.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {hiddenGems.map((gem) => (
              <ArticleCard key={gem.id} article={gem} />
            ))}
          </div>
        )}
      </div>

      {/* Умная лента «Для вас» — только для авторизованных */}
      {authenticated && feed && (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow mb-6">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
              🤖 For You
            </h3>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              based on your subscriptions, favorites and freshness
            </span>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {feed.items.length === 0
              ? "Your feed is empty. Subscribe to technologies in Explorer (🔔) and personal recommendations will appear here."
              : "Articles are ranked by your subscriptions, favorite technologies and freshness."}
          </p>

          {feed.items.length > 0 && (
            <div className="space-y-3">
              {feed.items.map((article) => (
                <div key={article.id} className="relative">
                  {/* Бейдж ранжирования ленты */}
                  <div className="absolute -left-2 top-3 z-10 hidden md:flex flex-col items-center">
                    <span
                      title="Personal feed score"
                      className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md shadow"
                    >
                      🤖 {article.feed_score}
                    </span>
                    {article.matched_techs.length > 0 && (
                      <span className="mt-1 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-[10px] font-medium px-1.5 py-0.5 rounded-md">
                        {article.matched_techs.join(", ")}
                      </span>
                    )}
                  </div>
                  <ArticleCard
                    article={article}
                    isFavorite={favoriteIds.has(article.id)}
                    onToggleFavorite={toggleFavorite}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* График трендов */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow mb-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
            Trends: {selectedTech}
          </h3>
          <select 
            value={selectedTech} 
            onChange={handleTechChange} 
            className="border border-gray-300 dark:border-gray-600 rounded px-3 py-1 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
          >
            {["AI", "Web", "Python", "Database", "DevOps", "Mobile", "Cloud", "Security", "Hardware"].map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        {timeline.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-8">
            No timeline data available
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={timeline}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" stroke="#6B7280" />
              <YAxis stroke="#6B7280" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1F2937', 
                  border: 'none', 
                  borderRadius: '8px',
                  color: '#fff'
                }} 
              />
              <Line 
                type="monotone" 
                dataKey="count" 
                stroke="#3B82F6" 
                strokeWidth={2} 
                dot={{ r: 4, fill: '#3B82F6' }} 
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Последние статьи */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">
          Latest Articles: {selectedTech}
        </h3>
        {articles.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-8">
            No articles found
          </p>
        ) : (
          <div className="space-y-3">
            {articles.map((article) => (
              <ArticleCard
                key={article.id}
                article={article}
                isFavorite={favoriteIds.has(article.id)}
                onToggleFavorite={authenticated ? toggleFavorite : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;