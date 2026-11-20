import { useState, useEffect, useRef } from "react";
import ArticleCard from "../components/ArticleCard.jsx";
import { useAuth } from "../context/AuthContext.jsx";

import { API_BASE_URL } from "../config.js";
const TECHNOLOGIES = ["AI", "Web", "Python", "Database", "DevOps", "Mobile", "Cloud", "Security", "Hardware"];
const PAGE_SIZE = 25;

const Explorer = () => {
  const { authFetch, authenticated } = useAuth();
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);
  const [articles, setArticles] = useState([]);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTech, setSelectedTech] = useState("");
  const [sortBy, setSortBy] = useState("date");
  const [favoriteIds, setFavoriteIds] = useState(new Set());
  const [reloadKey, setReloadKey] = useState(0);

  // Подписка на выбранную технологию
  const [subscribed, setSubscribed] = useState(false);
  const [subscriptionBusy, setSubscriptionBusy] = useState(false);
  const favAbortRef = useRef(null);

  const fetchPage = async (skip, { append = false, signal } = {}) => {
    const params = new URLSearchParams({
      q: searchTerm,
      technology: selectedTech,
      sort_by: sortBy,
      limit: String(PAGE_SIZE),
      skip: String(skip),
    });

    const response = await fetch(`${API_BASE_URL}/api/trends/search?${params}`, { signal });
    if (!response.ok) throw new Error("Failed to fetch");
    const data = await response.json();

    const items = Array.isArray(data?.items) ? data.items : [];
    setTotal(Number(data?.total) || 0);
    setArticles(prev => (append ? [...prev, ...items] : items));
    setError(null);

    if (!append) {
      // Проверяем избранные статьи только на первой странице загрузки фильтра
      const favChecks = await Promise.all(
        items.slice(0, 50).map(async (article) => {
          try {
            const res = await authFetch(`${API_BASE_URL}/api/favorites/check/${article.id}`);
            const fav = await res.json();
            return { id: article.id, isFavorite: fav.is_favorite };
          } catch {
            return { id: article.id, isFavorite: false };
          }
        })
      );
      setFavoriteIds(new Set(favChecks.filter(f => f.isFavorite).map(f => f.id)));
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    let isActive = true;

    // Небольшая задержка, чтобы не дёргать API на каждый символ
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        await fetchPage(0, { signal: controller.signal });
        if (!isActive) return;
        setSearching(false);
        setLoading(false);
      } catch (err) {
        if (err.name === "AbortError") return;
        console.error("Search error:", err);
        setError("Failed to load articles");
        setSearching(false);
        setLoading(false);
      }
    }, 300);

    return () => {
      isActive = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchTerm, selectedTech, sortBy, reloadKey, authenticated]);

  // Отменяем фоновые проверки избранного при размонтировании
  useEffect(() => () => favAbortRef.current?.abort(), []);

  /* Подписка: следим за выбранной технологией */
  useEffect(() => {
    if (!authenticated || !selectedTech) {
      setSubscribed(false);
      return;
    }

    let isActive = true;
    (async () => {
      try {
        const res = await authFetch(`${API_BASE_URL}/api/subscriptions`);
        if (!res.ok || !isActive) return;
        const data = await res.json();
        if (!isActive) return;
        setSubscribed(data.some(s => s.technology === selectedTech));
      } catch (err) {
        console.error("Subscriptions error:", err);
      }
    })();

    return () => { isActive = false; };
  }, [selectedTech, authenticated, reloadKey]);

  const toggleSubscription = async () => {
    if (!selectedTech) return;
    setSubscriptionBusy(true);
    try {
      const response = subscribed
        ? await authFetch(`${API_BASE_URL}/api/subscriptions/${encodeURIComponent(selectedTech)}`, { method: "DELETE" })
        : await authFetch(`${API_BASE_URL}/api/subscriptions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ technology: selectedTech }),
          });
      if (!response.ok && response.status !== 409) throw new Error("Failed");
      setSubscribed(!subscribed);
    } catch (err) {
      console.error("Subscription error:", err);
    } finally {
      setSubscriptionBusy(false);
    }
  };

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      await fetchPage(articles.length, { append: true });
    } catch (err) {
      console.error("Load more error:", err);
      setError("Failed to load more articles");
    } finally {
      setLoadingMore(false);
    }
  };

  const toggleFavorite = async (article) => {
    const isFavorite = favoriteIds.has(article.id);
    try {
      if (isFavorite) {
        const response = await authFetch(`${API_BASE_URL}/api/favorites/${article.id}`, { method: "DELETE" });
        // 404 = записи уже нет, считаем удалённой; при других ошибках ничего не меняем
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

  if (loading) return <div className="p-8 text-center text-gray-500">Loading articles...</div>;

  const hasMore = articles.length < total;

  return (
    <div>
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-2">🔍 Article Explorer</h1>
          <p className="text-gray-500 dark:text-gray-400">
            Search is done on the server, sorted and paginated · {articles.length} of {total} articles
          </p>
        </div>
        <button
          onClick={() => setReloadKey(key => key + 1)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg">{error}</div>
      )}

      {/* Фильтры */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input
            type="text"
            placeholder="Search by title..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
          />
          <div className="flex gap-2">
            <select
              value={selectedTech}
              onChange={(e) => setSelectedTech(e.target.value)}
              className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
            >
              <option value="">All Technologies</option>
              {TECHNOLOGIES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            {/* Кнопка подписки видна, когда выбрана конкретная технология и пользователь вошёл */}
            {authenticated && selectedTech && (
              <button
                type="button"
                onClick={toggleSubscription}
                disabled={subscriptionBusy}
                title={subscribed ? `Stop following ${selectedTech}` : `Follow new articles about ${selectedTech}`}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 ${
                  subscribed
                    ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 hover:bg-amber-200"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200"
                }`}
              >
                {subscribed ? "🔔" : "🔕"}
              </button>
            )}
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
          >
            <option value="date">📅 Date (newest)</option>
            <option value="score">⭐ Score (highest)</option>
            <option value="comments">💬 Comments (most)</option>
          </select>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">
          {searching ? "Searching..." : `Found: ${total} articles (server-sorted by ${sortBy})`}
          {authenticated && selectedTech && (
            <button
              type="button"
              onClick={toggleSubscription}
              disabled={subscriptionBusy}
              className="ml-3 text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
            >
              {subscribed ? `🔕 Unfollow ${selectedTech}` : `🔔 Follow ${selectedTech}`}
            </button>
          )}
          {authenticated && !selectedTech && (
            <span className="ml-3 text-gray-400 dark:text-gray-500">
              Select a technology above to follow it
            </span>
          )}
        </p>
      </div>

      {/* Статьи */}
      {articles.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-center py-8">No articles found</p>
      ) : (
        <div className="space-y-4">
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

      {/* Пагинация: подгружаем следующую страницу */}
      {hasMore && !searching && (
        <div className="text-center mt-6">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-6 py-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition font-medium disabled:opacity-50"
          >
            {loadingMore ? "Loading..." : `📄 Load more (${total - articles.length} left)`}
          </button>
        </div>
      )}
    </div>
  );
};

export default Explorer;
