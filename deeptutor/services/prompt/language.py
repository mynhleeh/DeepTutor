"""Shared language directives for prompt-driven LLM calls.

This helper centralizes the "stay in the requested language" instruction so
different modules can share the same behavior without depending on book-only
utilities.
"""

from __future__ import annotations

_LANGUAGE_LABELS: dict[str, str] = {
    "zh": "中文（简体）",
    "zh-cn": "中文（简体）",
    "zh-tw": "繁體中文",
    "en": "English",
    "ja": "日本語",
    "ko": "한국어",
    "es": "Español",
    "fr": "Français",
    "de": "Deutsch",
    "ru": "Русский",
    "pt": "Português",
    "it": "Italiano",
}


def normalize_language(language: str | None) -> str:
    return (language or "en").strip().lower() or "en"


def language_label(language: str | None) -> str:
    code = normalize_language(language)
    if code in _LANGUAGE_LABELS:
        return _LANGUAGE_LABELS[code]
    base = code.split("-", 1)[0]
    return _LANGUAGE_LABELS.get(base, language or "English")


def language_directive(language: str | None) -> str:
    """Return a flexible reader-facing language instruction for prompts."""
    code = normalize_language(language)
    label = language_label(code)
    if code.startswith("zh"):
        return (
            "\n\n[语言要求 / Language] 请优先使用用户交流时所用的语言进行回复，或根据用户的明确指令切换语言。"
            "你不受单一语言的限制。但在调用工具 (Tool calls)、编写代码或输出 JSON 时，请保持必要的英文格式。"
            "如果不确定，请默认使用中文（简体）。"
        )
    return (
        "\n\n[Language] Respond in the same language the user uses, or the language "
        "they explicitly instruct you to use. You are NOT restricted to a single language. "
        "However, maintain English for Tool calls, JSON formats, and code syntax. "
        f"If you are unsure, default to {label}."
    )


def append_language_directive(system_prompt: str | None, language: str | None) -> str:
    """Append the language directive to an existing system prompt."""
    base = (system_prompt or "").rstrip()
    directive = language_directive(language).strip()
    if not base:
        return directive
    return f"{base}\n\n{directive}"


__all__ = [
    "append_language_directive",
    "language_directive",
    "language_label",
    "normalize_language",
]
