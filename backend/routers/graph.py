from typing import Any
from fastapi import APIRouter
from database import trend_events

router = APIRouter(prefix="/api/graph", tags=["graph"])

TECH_HIERARCHY = {
    "Python": ["Django", "FastAPI", "Flask", "Pandas", "NumPy"],
    "Web": ["React", "Vue", "Angular", "TypeScript", "JavaScript"],
    "AI": ["Machine Learning", "Deep Learning", "LLM", "GPT"],
    "Database": ["PostgreSQL", "MongoDB", "Redis", "SQLite"],
    "DevOps": ["Docker", "Kubernetes", "Git", "Linux"],
    "Mobile": ["iOS", "Android", "Flutter", "Swift"],
    "Cloud": ["AWS", "Azure", "GCP"],
    "Hardware": ["GPU", "CPU", "Nvidia", "Apple"],
}

CATEGORY_COLORS = {
    "AI": "#3B82F6",
    "Web": "#10B981",
    "Python": "#FBBF24",
    "Database": "#8B5CF6",
    "DevOps": "#F97316",
    "Mobile": "#EC4899",
    "Cloud": "#06B6D4",
    "Security": "#EF4444",
    "Hardware": "#6B7280",
    "Networking": "#14B8A6",
    "Other": "#9CA3AF",
}

# Карта «технология -> категория» для кластеризации на фронтенде.
TECH_CATEGORY: dict[str, str] = {category: category for category in CATEGORY_COLORS}
for _category, _children in TECH_HIERARCHY.items():
    for _child in _children:
        TECH_CATEGORY[_child] = _category


@router.get("")
async def get_tech_graph() -> dict[str, Any]:
    try:
        # 1. Получаем все статьи с технологиями
        articles = await trend_events.find(
            {"technologies": {"$exists": True, "$type": "array"}},
            {"technologies": 1, "_id": 0}
        ).to_list(length=1000)
        
        print(f"📊 Найдено статей с технологиями: {len(articles)}")
        
        # 2. Считаем упоминания каждой технологии
        tech_counts: dict[str, int] = {}
        for article in articles:
            for tech in article.get("technologies", []):
                if tech:
                    tech_counts[tech] = tech_counts.get(tech, 0) + 1
        
        print(f"🔧 Уникальных технологий: {len(tech_counts)}")
        
        # 3. Формируем узлы (только с 2+ упоминаниями)
        nodes = []
        for tech, count in tech_counts.items():
            if count >= 2:
                group = TECH_CATEGORY.get(tech, "Other")
                nodes.append({
                    "id": tech,
                    "label": tech,
                    "value": count,
                    "group": group,
                    "color": CATEGORY_COLORS.get(group, CATEGORY_COLORS["Other"]),
                    "title": f"{tech}: {count} упоминаний",
                })
        
        print(f"🎯 Узлов для графа: {len(nodes)}")
        
        # 4. Считаем совместные упоминания (co-occurrence)
        pair_counts: dict[tuple[str, str], int] = {}
        for article in articles:
            techs = [t for t in article.get("technologies", []) if t]
            # Убираем дубликаты в одной статье
            techs = list(set(techs))
            for i in range(len(techs)):
                for j in range(i + 1, len(techs)):
                    pair = tuple(sorted([techs[i], techs[j]]))
                    pair_counts[pair] = pair_counts.get(pair, 0) + 1
        
        # 5. Формируем связи
        edges = []
        for (source, target), value in pair_counts.items():
            if value >= 1:
                edges.append({
                    "from": source,
                    "to": target,
                    "value": value,
                    "title": f"Совместных упоминаний: {value}",
                    "arrows": "to",
                })
        
        print(f"🔗 Связей co-occurrence: {len(edges)}")
        
        # 6. Добавляем иерархические связи
        hierarchy_edges = 0
        for parent, children in TECH_HIERARCHY.items():
            if parent not in tech_counts:
                continue
            for child in children:
                if child in tech_counts:
                    edges.append({
                        "from": parent,
                        "to": child,
                        "arrows": "to",
                        "color": {"color": "#9CA3AF", "highlight": "#3B82F6"},
                        "dashes": True,
                        "title": f"{parent} → {child} (иерархия)",
                        "smooth": {"type": "curvedCW", "roundness": 0.2},
                    })
                    hierarchy_edges += 1
        
        print(f"🌳 Иерархических связей: {hierarchy_edges}")
        
        return {
            "nodes": nodes,
            "edges": edges,
            "total_nodes": len(nodes),
            "total_edges": len(edges),
        }
    
    except Exception as e:
        print(f"❌ Ошибка в graph endpoint: {e}")
        import traceback
        traceback.print_exc()
        return {
            "error": str(e),
            "nodes": [],
            "edges": [],
            "total_nodes": 0,
            "total_edges": 0,
        }