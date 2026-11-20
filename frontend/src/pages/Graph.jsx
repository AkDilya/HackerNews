import { useEffect, useRef, useState } from "react";
import { Network } from "vis-network/standalone";
import { DataSet } from "vis-data";
import { useTheme } from "../context/ThemeContext.jsx";
import { API_BASE_URL, GITHUB_AUTH_URL } from "../config.js";

// Единая спокойная гамма: все категории — мягкие оттенки одного сине-серого спектра.
// Категория читается подписью кластера и размером узла, а не «радугой» цветов:
// цвет остаётся фоном, первым визуальным кодом остаётся размер.
const CATEGORY_COLORS = {
  "AI": "#B4C4DC",
  "Web": "#BCC9DA",
  "Python": "#C2CBDA",
  "Database": "#BEC2DA",
  "DevOps": "#C6CCD8",
  "Mobile": "#C3C9D6",
  "Cloud": "#AFC2D2",
  "Security": "#C8CBD4",
  "Hardware": "#CBCED4",
  "Networking": "#B3C3CE",
  "Other": "#CACCD2",
};

// Тёмная тема: те же оттенки спектра, но затемнённые — спокойные, не яркие
const DARK_CATEGORY_COLORS = {
  "AI": "#45566E",
  "Web": "#4A5B6D",
  "Python": "#4F6070",
  "Database": "#545F72",
  "DevOps": "#58646F",
  "Mobile": "#57606F",
  "Cloud": "#425C6E",
  "Security": "#5D6470",
  "Hardware": "#60646C",
  "Networking": "#3F5C68",
  "Other": "#5A5F66",
};

// Тема графика: фон, подписи, границы, рёбра и акцент кластеров для светлого и тёмного режимов
const GRAPH_THEMES = {
  light: {
    container: "radial-gradient(circle at 50% 38%, #FBFCFE 0%, #F1F4F8 68%, #E7ECF2 100%)",
    nodeFont: "#3E4C5E",
    nodeBorder: "#9AAABE",
    nodeHighlightBorder: "#5A6B80",
    nodeShadow: { color: "rgba(51, 65, 85, 0.10)", size: 6, x: 0, y: 2 },
    edge: { color: "#93A5B8", opacity: 0.28 },
    edgeDashed: { color: "#A8B4C2", opacity: 0.35 },
    edgeHover: "#64778C",
    clusterEdge: { color: "#8A9BAD", opacity: 0.45 },
    clusterBg: "#A9BACC",
    clusterBorder: "#7B90A8",
    clusterFont: "#2E3A4A",
  },
  dark: {
    container: "radial-gradient(circle at 50% 38%, #1C2634 0%, #0F172A 60%, #0B1120 100%)",
    nodeFont: "#D3DCE6",
    nodeBorder: "#2E3B4C",
    nodeHighlightBorder: "#8FA3B8",
    nodeShadow: { color: "rgba(0, 0, 0, 0.40)", size: 8, x: 0, y: 3 },
    edge: { color: "#4A5A6E", opacity: 0.35 },
    edgeDashed: { color: "#3E4C5E", opacity: 0.40 },
    edgeHover: "#7E93A8",
    clusterEdge: { color: "#4E5D70", opacity: 0.50 },
    clusterBg: "#36445A",
    clusterBorder: "#2A3648",
    clusterFont: "#E2E8F0",
  },
};

const CLUSTER_PREFIX = "__cluster__";
const DIMMED_NODE_OPACITY = 0.2;
const DIMMED_EDGE_OPACITY = 0.05;

const getEdgeBaseOpacity = (edge) => edge.options?.color?.opacity ?? 1;

const setEdgeOpacity = (edge, opacity) => {
  const color = edge.options?.color;

  if (typeof color === "string") {
    edge.setOptions({ color: { color, opacity } });
    return;
  }

  if (color && typeof color === "object") {
    edge.setOptions({ color: { ...color, opacity } });
  }
};

const applyFocus = (network, focusedIds, baseEdgeOpacity) => {
  const focused = new Set(focusedIds);

  Object.values(network.body.nodes).forEach((node) => {
    node.setOptions({
      opacity: focused.has(node.id) ? 1 : DIMMED_NODE_OPACITY,
    });
  });

  Object.values(network.body.edges).forEach((edge) => {
    if (!baseEdgeOpacity.has(edge.id)) {
      baseEdgeOpacity.set(edge.id, getEdgeBaseOpacity(edge));
    }

    const fromId = edge.fromId ?? edge.from?.id;
    const toId = edge.toId ?? edge.to?.id;
    const isConnected = focused.has(fromId) || focused.has(toId);

    setEdgeOpacity(
      edge,
      isConnected ? baseEdgeOpacity.get(edge.id) : DIMMED_EDGE_OPACITY
    );
  });

  network.redraw();
};

const resetHighlight = (network, baseEdgeOpacity) => {
  Object.values(network.body.nodes).forEach((node) => {
    node.setOptions({ opacity: 1 });
  });

  Object.values(network.body.edges).forEach((edge) => {
    const baseOpacity = baseEdgeOpacity.get(edge.id) ?? getEdgeBaseOpacity(edge);
    setEdgeOpacity(edge, baseOpacity);
  });

  network.redraw();
};

const clusterByCategory = (network, nodesData, clusterGroups, theme) => {
  const groups = [...new Set(nodesData.map((node) => node.group || "Other"))];

  groups.forEach((group) => {
    const members = nodesData.filter((node) => (node.group || "Other") === group);
    const clusterId = `${CLUSTER_PREFIX}${group}`;

    try {
      network.cluster({
        joinCondition: (nodeOptions) => nodeOptions.group === group,
        clusterNodeProperties: {
          id: clusterId,
          group,
          label: `${group} (${members.length})`,
          title: `${group}: ${members.length} technologies`,
          shape: "dot",
          size: 36,
          borderWidth: 3,
          color: {
            background: theme.clusterBg,
            border: theme.clusterBorder,
            highlight: { background: theme.clusterBg, border: theme.nodeHighlightBorder },
            hover: { background: theme.clusterBg, border: theme.nodeHighlightBorder },
          },
          font: { color: theme.clusterFont, size: 14, face: "Inter", bold: "700" },
          shadow: theme.nodeShadow,
          allowSingleNodeCluster: true,
        },
        clusterEdgeProperties: {
          width: 2,
          color: theme.clusterEdge,
          smooth: { enabled: true, type: "continuous", roundness: 0.12 },
        },
      });

      clusterGroups.set(clusterId, group);
    } catch (err) {
      console.error(`Cluster error (${group}):`, err);
    }
  });
};

const normalizeSimilar = (data) => {
  if (!Array.isArray(data)) return [];

  return data
    .map((item) => (typeof item === "string" ? { name: item } : item))
    .filter((item) => item && typeof item.name === "string" && item.name.length > 0);
};

const Graph = () => {
  const networkRef = useRef(null);
  const containerRef = useRef(null);
  const clusterGroupsRef = useRef(new Map());
  const techGroupsRef = useRef(new Map());
  const baseEdgeOpacityRef = useRef(new Map());
  const articlesAbortRef = useRef(null);
  const similarAbortRef = useRef(null);
  const { darkMode } = useTheme();
  const theme = GRAPH_THEMES[darkMode ? "dark" : "light"];

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [selection, setSelection] = useState(null);
  const [articles, setArticles] = useState([]);
  const [similar, setSimilar] = useState([]);
  const [loadingArticles, setLoadingArticles] = useState(false);
  const [loadingSimilar, setLoadingSimilar] = useState(false);
  const [articlesError, setArticlesError] = useState(false);
  const [focusNotice, setFocusNotice] = useState(null);
  // Поиск по графу: подсказки из фактических узлов, Enter или кнопка — фокус на технологии
  const [searchQuery, setSearchQuery] = useState("");
  const [nodeNames, setNodeNames] = useState([]);

  const handleSearch = () => {
    const query = searchQuery.trim();
    if (!query) return;

    const exact = nodeNames.find(
      (name) => name.toLowerCase() === query.toLowerCase()
    );
    selectTech(exact || query);
    if (exact) setSearchQuery(exact);
  };

  const applyFocusToGraph = (focusedIds) => {
    const network = networkRef.current;
    if (!network) return;

    if (!focusedIds || focusedIds.length === 0) {
      resetHighlight(network, baseEdgeOpacityRef.current);
      return;
    }

    applyFocus(network, focusedIds, baseEdgeOpacityRef.current);
  };

  const focusNode = (techName) => {
    const network = networkRef.current;
    if (!network || !network.body.nodes[techName]) return false;

    const stack = network.findNode(techName);
    if (!stack.length) return false;

    // Если технология спрятана в кластере — сначала раскрываем его.
    stack.slice(0, -1).forEach((clusterId) => {
      if (network.body.nodes[clusterId] && network.isCluster(clusterId)) {
        network.openCluster(clusterId);
        clusterGroupsRef.current.delete(clusterId);
      }
    });

    applyFocusToGraph([techName]);
    network.selectNodes([techName]);

    const position = network.getPosition(techName);
    if (position) {
      network.moveTo({
        position,
        scale: network.getScale(),
        animation: { duration: 350, easingFunction: "easeInOutQuad" },
      });
    }

    return true;
  };

  const expandCluster = (clusterId) => {
    const network = networkRef.current;
    if (!network || !network.body.nodes[clusterId] || !network.isCluster(clusterId)) {
      return;
    }

    const group =
      clusterGroupsRef.current.get(clusterId) ||
      network.body.nodes[clusterId].options.label ||
      "Category";
    const members = network.getNodesInCluster(clusterId) || [];

    network.openCluster(clusterId);
    clusterGroupsRef.current.delete(clusterId);
    applyFocusToGraph(members);
    network.selectNodes(members);

    setSelection({
      type: "cluster",
      id: null,
      label: group,
      members,
      opened: true,
    });
    setFocusNotice(null);
  };

  const selectCluster = (clusterId) => {
    const network = networkRef.current;
    if (!network || !network.body.nodes[clusterId]) return;

    const group =
      clusterGroupsRef.current.get(clusterId) ||
      network.body.nodes[clusterId].options.label ||
      "Category";
    const members = network.getNodesInCluster(clusterId) || [];

    setSelection({
      type: "cluster",
      id: clusterId,
      label: group,
      members,
      opened: false,
    });
    setArticles([]);
    setSimilar([]);
    setArticlesError(false);
    setFocusNotice(null);
    applyFocusToGraph([clusterId]);
  };

  const clearSelection = () => {
    articlesAbortRef.current?.abort();
    similarAbortRef.current?.abort();
    articlesAbortRef.current = null;
    similarAbortRef.current = null;

    setSelection(null);
    setArticles([]);
    setSimilar([]);
    setArticlesError(false);
    setFocusNotice(null);
    setLoadingArticles(false);
    setLoadingSimilar(false);

    const network = networkRef.current;
    if (network) {
      resetHighlight(network, baseEdgeOpacityRef.current);
      network.unselectAll();
    }
  };

  const loadArticles = async (techName) => {
    articlesAbortRef.current?.abort();
    const controller = new AbortController();
    articlesAbortRef.current = controller;

    setLoadingArticles(true);
    setArticlesError(false);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/trends/${encodeURIComponent(techName)}/articles?limit=10`,
        { signal: controller.signal }
      );
      if (!response.ok) throw new Error("Failed to load articles");

      const data = await response.json();
      if (articlesAbortRef.current === controller) {
        setArticles(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      if (err.name !== "AbortError" && articlesAbortRef.current === controller) {
        console.error("Articles error:", err);
        setArticles([]);
        setArticlesError(true);
      }
    } finally {
      if (articlesAbortRef.current === controller) {
        setLoadingArticles(false);
      }
    }
  };

  const loadSimilar = async (techName) => {
    similarAbortRef.current?.abort();
    const controller = new AbortController();
    similarAbortRef.current = controller;

    setLoadingSimilar(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/trends/similar/${encodeURIComponent(techName)}?limit=3`,
        { signal: controller.signal }
      );
      if (!response.ok) throw new Error("Failed to load similar technologies");

      const data = await response.json();
      if (similarAbortRef.current === controller) {
        setSimilar(normalizeSimilar(data));
      }
    } catch (err) {
      if (err.name !== "AbortError" && similarAbortRef.current === controller) {
        console.error("Similar technologies error:", err);
        setSimilar([]);
      }
    } finally {
      if (similarAbortRef.current === controller) {
        setLoadingSimilar(false);
      }
    }
  };

  const selectTech = (techName) => {
    setSelection({
      type: "tech",
      id: techName,
      label: techName,
      group: techGroupsRef.current.get(techName) || null,
    });
    setArticles([]);
    setSimilar([]);
    setArticlesError(false);

    loadArticles(techName);
    loadSimilar(techName);

    const focused = focusNode(techName);
    if (focused) {
      setFocusNotice(null);
    } else {
      applyFocusToGraph(null);
      networkRef.current?.unselectAll();
      setFocusNotice(`"${techName}" is not on the graph yet — showing articles only.`);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadGraph = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`${API_BASE_URL}/api/graph`);
        if (!response.ok) throw new Error("Failed to load graph");

        const data = await response.json();
        if (data.error) throw new Error(data.error);
        if (cancelled) return;

        const rawNodes = Array.isArray(data.nodes) ? data.nodes : [];
        const rawEdges = Array.isArray(data.edges) ? data.edges : [];

        setStats({
          total_nodes: rawNodes.length,
          total_edges: rawEdges.length,
        });

        if (!containerRef.current) {
          setLoading(false);
          return;
        }

        if (networkRef.current) {
          networkRef.current.destroy();
          networkRef.current = null;
        }

        if (rawNodes.length === 0) {
          setLoading(false);
          return;
        }

        const nodesData = rawNodes.map((node) => {
          const group = node.group || "Other";
          const background = (darkMode ? DARK_CATEGORY_COLORS : CATEGORY_COLORS)[group]
            || (darkMode ? DARK_CATEGORY_COLORS : CATEGORY_COLORS).Other;

          return {
            id: node.id,
            label: node.label,
            value: node.value,
            group,
            color: {
              background,
              border: theme.nodeBorder,
              highlight: { background, border: theme.nodeHighlightBorder },
              hover: { background, border: theme.nodeHighlightBorder },
            },
            title: node.title || `${node.label}: ${node.value} mentions`,
            font: { color: theme.nodeFont, size: 12, face: "Inter" },
            borderWidth: 2,
            shadow: theme.nodeShadow,
          };
        });

        const maxEdgeValue = Math.max(...rawEdges.map((edge) => edge.value || 0), 1);
        const edgesData = rawEdges.map((edge, idx) => ({
          id: `edge-${idx}`,
          from: edge.from,
          to: edge.to,
          value: edge.value,
          title: edge.title,
          arrows: "none",
          // Толщина отражает силу связи; лёгкая кривизна мягче смотрится при пересечениях
          color: edge.dashes ? theme.edgeDashed : theme.edge,
          dashes: edge.dashes || false,
          smooth: { enabled: true, type: "continuous", roundness: 0.12 },
          width: edge.dashes ? 1 + (edge.value || 0) / maxEdgeValue : 1.5 + 2.5 * ((edge.value || 0) / maxEdgeValue),
        }));

        const nodes = new DataSet(nodesData);
        const edges = new DataSet(edgesData);

        clusterGroupsRef.current.clear();
        techGroupsRef.current = new Map(
          nodesData.map((node) => [node.id, node.group])
        );
        setNodeNames(
          nodesData
            .map((node) => node.label)
            .sort((a, b) => a.localeCompare(b))
        );
        baseEdgeOpacityRef.current = new Map(
          edgesData.map((edge) => [edge.id, edge.color?.opacity ?? 1])
        );

        const options = {
          nodes: {
            shape: "dot",
            borderWidth: 2,
            shadow: theme.nodeShadow,
            scaling: {
              min: 25,
              max: 40,
              label: { enabled: true, min: 11, max: 14 },
            },
          },
          edges: {
            width: 1.5,
            hoverWidth: (width) => width + 1,
            selectionWidth: (width) => width + 1.5,
            smooth: { type: "continuous" },
          },
          physics: {
            enabled: true,
            barnesHut: {
              gravitationalConstant: -10000,
              centralGravity: 0.05,
              springLength: 200,
              springConstant: 0.008,
              damping: 0.25,
            },
            stabilization: {
              iterations: 400,
              updateInterval: 20,
            },
            maxVelocity: 8,
          },
          interaction: {
            hover: true,
            tooltipDelay: 200,
            dragNodes: true,
            dragView: true,
            zoomView: true,
            hideEdgesOnDrag: false,
          },
        };

        const network = new Network(
          containerRef.current,
          { nodes, edges },
          options
        );
        networkRef.current = network;

        // Сначала даём графу стабилизироваться, затем «замораживаем» физику
        // и собираем технологии в кластеры по категориям.
        network.once("stabilizationIterationsDone", () => {
          if (networkRef.current !== network) return;

          network.setOptions({ physics: { enabled: false } });
          clusterByCategory(network, nodesData, clusterGroupsRef.current, theme);
        });

        network.on("click", (params) => {
          if (params.nodes.length === 0) {
            clearSelection();
            return;
          }

          const nodeId = params.nodes[0];
          const isCluster =
            network.body.nodes[nodeId] && network.isCluster(nodeId);

          if (isCluster) {
            selectCluster(nodeId);
          } else {
            selectTech(nodeId);
          }
        });

        network.on("doubleClick", (params) => {
          if (params.nodes.length === 0) return;

          const nodeId = params.nodes[0];
          if (network.body.nodes[nodeId] && network.isCluster(nodeId)) {
            expandCluster(nodeId);
          }
        });

        if (cancelled) {
          network.destroy();
          networkRef.current = null;
          return;
        }

        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error("Graph error:", err);
        setError("Failed to load the technology graph.");
        setLoading(false);
      }
    };

    loadGraph();

    return () => {
      cancelled = true;

      if (networkRef.current) {
        networkRef.current.destroy();
        networkRef.current = null;
      }

      articlesAbortRef.current?.abort();
      similarAbortRef.current?.abort();
      articlesAbortRef.current = null;
      similarAbortRef.current = null;
    };
  }, [reloadKey, darkMode]);

  const isEmpty = !loading && !error && stats && stats.total_nodes === 0;

  return (
    <div className="rounded-xl bg-white p-6 shadow-md dark:bg-gray-800">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">🕸️ Technology Connections Graph</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Click a category to focus • Double-click a category to expand • Click empty space to reset •
            Line thickness = connection strength
          </p>
        </div>
        <div className="text-right text-sm text-gray-500 dark:text-gray-400">
          {/* Поиск технологии с автодополнением — фокус + плавный зум к узлу */}
          <div className="mb-2 flex items-center justify-end gap-2">
            <input
              type="text"
              list="graph-tech-names"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleSearch();
              }}
              placeholder="Search technology…"
              className="w-44 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
            />
            <datalist id="graph-tech-names">
              {nodeNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <button
              type="button"
              onClick={handleSearch}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700"
            >
              Find
            </button>
          </div>

          {stats && (
            <>
              <div>Technologies: {stats.total_nodes}</div>
              <div>Connections: {stats.total_edges}</div>
            </>
          )}
          {selection && (
            <button
              type="button"
              onClick={clearSelection}
              className="mt-2 rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 transition hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Reset focus
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1">
          <div
            ref={containerRef}
            style={{ background: theme.container }}
            className="h-[600px] w-full rounded-lg border border-gray-200 dark:border-gray-700"
          />

          {loading && (
            <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/75 dark:bg-gray-900/75">
              <p className="text-gray-500 dark:text-gray-400">Loading graph...</p>
            </div>
          )}

          {!loading && error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-lg bg-white/90 dark:bg-gray-900/90 px-6 text-center">
              <p className="text-red-600 dark:text-red-400">{error}</p>
              <button
                type="button"
                onClick={() => setReloadKey((key) => key + 1)}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
              >
                Retry
              </button>
            </div>
          )}

          {isEmpty && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-white/90 dark:bg-gray-900/90 px-6 text-center">
              <p className="text-lg font-medium text-gray-700 dark:text-gray-200">
                Not enough data to build the graph
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Run the collector to load more stories and technologies.
              </p>
            </div>
          )}
        </div>

        {selection && (
          <div className="max-h-[600px] w-96 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-gray-800 dark:text-white">
                  {selection.type === "cluster" ? "📦" : "📰"}{" "}
                  {selection.type === "cluster"
                    ? `Category: ${selection.label}`
                    : `Articles: ${selection.label}`}
                </h2>
                {selection.type === "tech" && selection.group && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">Category: {selection.group}</p>
                )}
                {selection.type === "cluster" && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {selection.members.length} technologies
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={clearSelection}
                className="text-gray-500 dark:text-gray-400 transition hover:text-gray-700 dark:hover:text-gray-200"
                aria-label="Close panel"
              >
                ✕
              </button>
            </div>

            {selection.type === "tech" ? (
              <>
                {focusNotice && (
                  <p className="mb-3 rounded-md bg-amber-50 dark:bg-amber-900/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                    {focusNotice}
                  </p>
                )}

                {loadingArticles ? (
                  <p className="text-gray-500 dark:text-gray-400">Loading articles...</p>
                ) : articlesError ? (
                  <p className="text-red-600 dark:text-red-400">Failed to load articles.</p>
                ) : articles.length === 0 ? (
                  <p className="text-gray-500 dark:text-gray-400">No articles found</p>
                ) : (
                  <div className="space-y-3">
                    {articles.map((article, idx) => (
                      <div
                        key={article.id ?? idx}
                        className="rounded-lg border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 shadow-sm"
                      >
                        <h3 className="mb-1 text-sm font-semibold text-gray-800 dark:text-white">
                          {article.title}
                        </h3>
                        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                          <span>⭐ {article.score}</span>
                          <span>💬 {article.descendants}</span>
                          <span>
                            {new Date(article.created_at).toLocaleDateString("en-US")}
                          </span>
                        </div>
                        {article.url && (
                          <a
                            href={article.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 inline-block text-xs text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            Read more →
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-3">
                  <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
                    Similar technologies
                  </h3>

                  {loadingSimilar ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400">Loading recommendations...</p>
                  ) : similar.length === 0 ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Not enough co-mentions yet.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {similar.map((item) => (
                        <button
                          key={item.name}
                          type="button"
                          onClick={() => selectTech(item.name)}
                          title={
                            item.count
                              ? `${item.count} co-mentions`
                              : undefined
                          }
                          className="rounded-full bg-blue-100 dark:bg-blue-900/40 px-3 py-1 text-xs font-medium text-blue-800 dark:text-blue-300 transition hover:bg-blue-200 dark:hover:bg-blue-900/70"
                        >
                          {item.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                {!selection.opened && selection.id && (
                  <button
                    type="button"
                    onClick={() => expandCluster(selection.id)}
                    className="mb-4 w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
                  >
                    Expand cluster
                  </button>
                )}

                <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
                  Technologies in this category
                </h3>

                {selection.members.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No technologies found.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {selection.members.map((techName) => (
                      <button
                        key={techName}
                        type="button"
                        onClick={() => selectTech(techName)}
                        className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                      >
                        {techName}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 rounded-lg bg-blue-50 dark:bg-blue-900/30 p-4 text-sm text-blue-700 dark:text-blue-300">
        <strong>💡 Hint:</strong> Categories are clustered. Double-click a cluster to inspect
        its technologies; click a technology to focus it and see related articles.
      </div>
    </div>
  );
};

export default Graph;
