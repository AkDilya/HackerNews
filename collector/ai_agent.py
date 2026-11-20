import json
import os
import re
from typing import Any

import httpx
from dotenv import load_dotenv

load_dotenv()

OLLAMA_URL: str = os.getenv("OLLAMA_URL", "http://localhost:11434/api/generate")
OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "qwen2.5:0.5b")  

# ВАЖНО: True = использовать LLM, False = мгновенный режим без LLM
USE_LLM = True

VALID_SENTIMENTS: set[str] = {"positive", "neutral", "negative"}
VALID_CATEGORIES: set[str] = {"database", "ai", "web", "devops", "mobile", "cloud", "other"}

JSON_BLOCK_PATTERN = re.compile(r"\{.*\}", re.DOTALL)

TECH_SYNONYMS: dict[str, str] = {
    "ai": "AI", "artificial intelligence": "AI", "machine learning": "AI",
    "ml": "AI", "deep learning": "AI", "llm": "AI", "gpt": "AI",
    "chatgpt": "AI", "openai": "AI", "neural network": "AI",
    "web": "Web", "javascript": "Web", "react": "Web", "vue": "Web",
    "angular": "Web", "html": "Web", "css": "Web", "frontend": "Web",
    "backend": "Web", "typescript": "Web", "node.js": "Web", "nodejs": "Web",
    "python": "Python", "django": "Python", "flask": "Python", "fastapi": "Python",
    "database": "Database", "sql": "Database", "mongodb": "Database",
    "postgres": "Database", "postgresql": "Database", "mysql": "Database",
    "sqlite": "Database", "nosql": "Database", "redis": "Database",
    "devops": "DevOps", "docker": "DevOps", "kubernetes": "DevOps", "k8s": "DevOps",
    "git": "DevOps", "github": "DevOps", "linux": "DevOps", "jenkins": "DevOps",
    "mobile": "Mobile", "ios": "Mobile", "android": "Mobile", "iphone": "Mobile",
    "app": "Mobile", "flutter": "Mobile", "swift": "Mobile", "kotlin": "Mobile",
    "cloud": "Cloud", "aws": "Cloud", "azure": "Cloud", "gcp": "Cloud", "serverless": "Cloud",
    "security": "Security", "encryption": "Security", "privacy": "Security", "oauth": "Security",
    "gpu": "Hardware", "cpu": "Hardware", "nvidia": "Hardware",
    "amd": "Hardware", "intel": "Hardware", "apple": "Hardware",
}


def _normalize_technologies(technologies: list[str]) -> list[str]:
    if not technologies:
        return []
    normalized = []
    for tech in technologies:
        if not tech or not isinstance(tech, str):
            continue
        tech_lower = tech.lower().strip()
        if tech_lower in TECH_SYNONYMS:
            normalized.append(TECH_SYNONYMS[tech_lower])
        else:
            matched = False
            for synonym_key, canonical in TECH_SYNONYMS.items():
                if synonym_key in tech_lower:
                    normalized.append(canonical)
                    matched = True
                    break
            if not matched:
                normalized.append(tech.title())
    seen = set()
    return [tech for tech in normalized if not (tech in seen or seen.add(tech))]


def _simple_extract(title: str) -> dict[str, Any]:
    """Быстрое извлечение по ключевым словам"""
    title_lower = title.lower()
    technologies = []
    keywords = {
        "AI": ["ai", "machine learning", "llm", "gpt", "chatgpt", "openai", "neural", "deep learning", "claude", "codex", "anthropic", "gemini", "deepseek", "llama", "mistral", "copilot", "qwen", "transformers", "huggingface", "agentic"],
        "Web": ["web", "javascript", "react", "vue", "angular", "html", "css", "typescript", "frontend", "backend", "svelte", "next.js", "node"],
        "Python": ["python", "django", "flask", "fastapi", "pandas", "numpy"],
        "Database": ["database", "sql", "mongodb", "postgres", "postgresql", "mysql", "sqlite", "nosql", "redis", "clickhouse", "duckdb", "supabase"],
        "DevOps": ["docker", "kubernetes", "devops", "ci/cd", "jenkins", "git", "github", "linux", "k8s", "terraform", "ansible"],
        "Mobile": ["mobile", "ios", "android", "iphone", "app", "flutter", "swift", "kotlin"],
        "Cloud": ["cloud", "aws", "azure", "gcp", "serverless", "lambda"],
        "Security": ["security", "encryption", "privacy", "oauth", "password", "authentication", "cve", "exploit", "malware", "ransomware", "phishing", "2fa"],
        "Hardware": ["gpu", "cpu", "nvidia", "amd", "intel", "apple", "chip", "processor", "mac", "macos", "raspberry", "arduino", "semiconductor", "asml", "tsmc", "quantum", "silicon"],
        "Networking": ["network", "tcp", "ip", "dns", "vpn", "5g", "wifi", "http", "https"],
    }
    for tech, words in keywords.items():
        if any(word in title_lower for word in words):
            technologies.append(tech)
    return {"technologies": technologies[:3], "sentiment": "neutral", "category": "other"}


def _build_prompt(title: str) -> str:
    return (
        f"Extract 1-3 tech from: \"{title}\"\n"
        "JSON: {\"technologies\":[],\"sentiment\":\"neutral\",\"category\":\"other\"}\n"
        "Rules: only real tech (AI,Web,Python,Database,DevOps,Mobile,Cloud,Security,Hardware)."
        " If none, empty array. ONLY JSON."
    )


def _default_result() -> dict[str, Any]:
    return {"technologies": [], "sentiment": "neutral", "category": "other"}


def _extract_json(raw_text: str) -> dict[str, Any]:
    match = JSON_BLOCK_PATTERN.search(raw_text)
    if match is None:
        raise ValueError("No JSON object found in model response")
    return json.loads(match.group(0))


def _validate_result(parsed: dict[str, Any]) -> dict[str, Any]:
    technologies = parsed.get("technologies")
    if not isinstance(technologies, list) or not all(isinstance(tech, str) for tech in technologies):
        technologies = []
    sentiment = parsed.get("sentiment")
    if sentiment not in VALID_SENTIMENTS:
        sentiment = "neutral"
    category = parsed.get("category")
    if category not in VALID_CATEGORIES:
        category = "other"
    return {"technologies": technologies, "sentiment": sentiment, "category": category}


def extract_technologies(title: str) -> dict[str, Any]:
    """Мгновенное извлечение технологий + простой анализ тональности"""
    title_lower = title.lower()
    technologies = []
    
    # Ключевые слова для технологий
    keywords = {
        "AI": ["ai", "machine learning", "llm", "gpt", "chatgpt", "openai", "neural", "deep learning", "claude", "codex", "anthropic", "gemini", "deepseek", "llama", "mistral", "copilot", "qwen", "transformers", "huggingface", "agentic"],
        "Web": ["web", "javascript", "react", "vue", "angular", "html", "css", "typescript", "frontend", "backend", "svelte", "next.js", "node"],
        "Python": ["python", "django", "flask", "fastapi", "pandas", "numpy"],
        "Database": ["database", "sql", "mongodb", "postgres", "postgresql", "mysql", "sqlite", "nosql", "redis", "clickhouse", "duckdb", "supabase"],
        "DevOps": ["docker", "kubernetes", "devops", "ci/cd", "jenkins", "git", "github", "linux", "k8s", "terraform", "ansible"],
        "Mobile": ["mobile", "ios", "android", "iphone", "app", "flutter", "swift", "kotlin"],
        "Cloud": ["cloud", "aws", "azure", "gcp", "serverless", "lambda"],
        "Security": ["security", "encryption", "privacy", "oauth", "password", "authentication", "cve", "exploit", "malware", "ransomware", "phishing", "2fa"],
        "Hardware": ["gpu", "cpu", "nvidia", "amd", "intel", "apple", "chip", "processor", "mac", "macos", "raspberry", "arduino", "semiconductor", "asml", "tsmc", "quantum", "silicon"],
        "Networking": ["network", "tcp", "ip", "dns", "vpn", "5g", "wifi", "http", "https"],
    }
    
    # Определяем технологии
    for tech, words in keywords.items():
        if any(word in title_lower for word in words):
            technologies.append(tech)
    
    # 🎯 Простой анализ тональности по ключевым словам
    positive_words = [
        "new", "release", "launch", "improve", "better", "fast", "success", 
        "win", "great", "awesome", "excited", "love", "best", "upgrade",
        "announces", "unveils", "introduces", "debuts"
    ]
    negative_words = [
        "fail", "error", "crash", "bug", "issue", "problem", "vulnerability",
        "attack", "breach", "leak", "shutdown", "close", "layoff", "fired",
        "controversy", "scandal", "lawsuit", "ban", "block", "dead", "died",
        "warning", "risk", "threat", "concern", "criticism"
    ]
    
    positive_count = sum(1 for word in positive_words if word in title_lower)
    negative_count = sum(1 for word in negative_words if word in title_lower)
    
    if positive_count > negative_count:
        sentiment = "positive"
    elif negative_count > positive_count:
        sentiment = "negative"
    else:
        sentiment = "neutral"
    
    # Определяем категорию
    category_map = {
        "AI": "ai", "Web": "web", "Python": "web", "Database": "database",
        "DevOps": "devops", "Mobile": "mobile", "Cloud": "cloud",
        "Security": "other", "Hardware": "other", "Networking": "other",
    }
    category = category_map.get(technologies[0] if technologies else "", "other")
    
    result_techs = _normalize_technologies(technologies)[:3]
    
    return {
        "technologies": result_techs,
        "sentiment": sentiment,
        "category": category
    }