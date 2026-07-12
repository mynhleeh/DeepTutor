# Language Decoupling (Soft Language Directive)

## The Problem
In the original DeepTutor implementation, the `language_directive` (located in `deeptutor/services/prompt/language.py`) applied a "Strict" rule for language output. When the system received a language setting (e.g., English), it forcefully instructed all Sub-Agents (such as `vision_solver`, `question/pipeline`, `research`) to return results in that specific language, regardless of the language the user was currently communicating in. 

This created a rigid and disjointed experience: the Chat Agent might converse with the user in Vietnamese, but when solving a math problem or generating a quiz, the result from the Sub-Agent would be strictly in English.

## The Solution
We have modified the core `language_directive()` function to switch from a "Strict" constraint to a "Soft" guidance approach. Specifically:

1. **User-Centric Language Adaptation:** The AI is now instructed to prioritize the language the user is actively communicating in, or the language explicitly requested by the user. It is no longer restricted to a single system language.
2. **Protected Tool Calling:** To prevent systemic errors (especially with smaller AI models), a safeguard was added to the soft directive: *"maintain English for Tool calls, JSON formats, and code syntax."* This ensures that while the AI speaks a different language, its internal API calls and structured outputs remain valid.
3. **Empowerment in Reading Comprehension:** Previously, inputting a Japanese text would yield an English quiz due to system constraints. With this decoupling, if a user explicitly requests, "Create a quiz in Vietnamese from this Japanese text," the AI will readily comply, as it is no longer blocked by the rigid system language enforcement.

## File Changes
- **Modified:** `deeptutor/services/prompt/language.py`
