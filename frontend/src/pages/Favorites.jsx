import { useState, useEffect } from "react";
import ArticleCard from "../components/ArticleCard.jsx";
import { useAuth } from "../context/AuthContext.jsx";

import { API_BASE_URL } from "../config.js";

/* Личный кабинет: избранные статьи и подписки текущего пользователя (требуется авторизация) */
const Account = () => {
  const { authFetch, user, logout } = useAuth();
  const [favorites, setFavorites] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => { loadFavorites(); loadSubscriptions(); }, []);

  const loadFavorites = async () => {
    try {
      const response = await authFetch(`${API_BASE_URL}/api/favorites`);
      if (response.status === 401) {
        // Токен протух/невалиден — сбрасываем, RequireAuth покажет форму входа
        logout();
        return;
      }
      if (!response.ok) throw new Error("Failed to fetch");
      const data = await response.json();
      setFavorites(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      console.error("Favorites error:", err);
      setError("Failed to load favorites");
    } finally {
      setLoading(false);
    }
  };

  const loadSubscriptions = async () => {
    try {
      const response = await authFetch(`${API_BASE_URL}/api/subscriptions`);
      if (!response.ok) throw new Error("Failed to fetch");
      const data = await response.json();
      setSubscriptions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Subscriptions error:", err);
    }
  };

  /* Отписаться от технологии */
  const unsubscribe = async (technology) => {
    try {
      const response = await authFetch(`${API_BASE_URL}/api/subscriptions/${encodeURIComponent(technology)}`, {
        method: "DELETE",
      });
      if (!response.ok && response.status !== 404) throw new Error("Failed");
      setSubscriptions(prev => prev.filter(s => s.technology !== technology));
    } catch (err) {
      console.error("Unsubscribe error:", err);
    }
  };

  /* Отметить технологию просмотренной: счётчик «новых» обнуляется */
  const markVisited = async (technology) => {
    try {
      const response = await authFetch(`${API_BASE_URL}/api/subscriptions/${encodeURIComponent(technology)}/visit`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed");
      setSubscriptions(prev => prev.map(s => (s.technology === technology ? { ...s, new_count: 0 } : s)));
    } catch (err) {
      console.error("Mark visited error:", err);
    }
  };

  /* Кнопка сердечка в кабинете работает в обе стороны: добавить/убрать */
  const toggleFavorite = async (article) => {
    const articleId = article.article_id ?? article.id;
    if (articleId == null) return;

    try {
      const response = await authFetch(`${API_BASE_URL}/api/favorites/${articleId}`, {
        method: "DELETE",
      });
      if (!response.ok && response.status !== 404) throw new Error("Failed to remove");
      setFavorites(prev => prev.filter(f => f.article_id !== articleId));
      setError(null);
    } catch (err) {
      console.error("Remove error:", err);
      setError("Failed to remove article");
    }
  };

  if (loading) return <div className="p-8 text-gray-500 dark:text-gray-400">Loading...</div>;

  const totalScore = favorites.reduce((sum, f) => sum + (f.score || 0), 0);

  return (
    <div className="dark:bg-gray-900 min-h-screen">
      <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-2">
        👤 Account
      </h1>
      <p className="text-gray-500 dark:text-gray-400 mb-6">
        {user?.username ? `Signed in as ${user.username}. ` : ""}
        Articles you marked with a heart in Explorer or Dashboard.
      </p>

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg">
          {error}
        </div>
      )}

      {/* Мини-статистика кабинета */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <p className="text-sm text-gray-500 dark:text-gray-400">Favorites</p>
          <p className="text-2xl font-bold text-gray-800 dark:text-white">{favorites.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <p className="text-sm text-gray-500 dark:text-gray-400">Total score</p>
          <p className="text-2xl font-bold text-gray-800 dark:text-white">{totalScore}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <p className="text-sm text-gray-500 dark:text-gray-400">Subscriptions</p>
          <p className="text-2xl font-bold text-gray-800 dark:text-white">{subscriptions.length}</p>
        </div>
      </div>

      {/* Подписки на технологии */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow mb-6">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">🔔 My subscriptions</h2>
        {subscriptions.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No subscriptions yet. Pick a technology in Explorer and press 🔔 "Follow" — new articles will appear here.
          </p>
        ) : (
          <div className="space-y-3">
            {subscriptions.map((subscription) => (
              <div
                key={subscription.technology}
                className="flex items-center justify-between gap-4 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3"
              >
                <div>
                  <p className="font-medium text-gray-800 dark:text-white">
                    {subscription.technology}
                    {subscription.new_count > 0 && (
                      <span className="ml-2 inline-block bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">
                        +{subscription.new_count} new
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Total articles: {subscription.total_count}
                  </p>
                </div>
                <div className="flex gap-2">
                  {subscription.new_count > 0 && (
                    <button
                      type="button"
                      onClick={() => markVisited(subscription.technology)}
                      className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition"
                    >
                      Mark as read
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => unsubscribe(subscription.technology)}
                    className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition"
                  >
                    Unfollow
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {favorites.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 p-12 rounded-lg shadow text-center">
          <p className="text-6xl mb-4">📭</p>
          <p className="text-gray-500 dark:text-gray-400">
            Nothing here yet. Press 🤍 next to an article and it will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {favorites.map((fav) => (
            <ArticleCard
              key={fav.article_id}
              article={fav}
              isFavorite
              onToggleFavorite={toggleFavorite}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default Account;
