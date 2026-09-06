# Importance Sliders

_Started 2026-06-13 11:49 UTC_

---

## User

Solver weights is too... technical. Can we rephrase it?
Also rephrase its content, the tool target audience is not technical users. It's for non-technical users and it has to be easy to understand and use (something that kids can use).

## Assistant

_[tool: read_file]_

_[tool: grep]_

Let me find the `WeightsConfig` function specifically.

_[tool: read_file]_

_[tool: grep]_

Let me check `data.js` for the `SF.SOFT` definitions too.

_[tool: str_replace_edit]_

Now I have everything I need. Let me rephrase the section name, SOFT data, and WeightsConfig UI to be friendly and non-technical.

_[tool: str_replace_edit]_

Now updating `admin.jsx` — section name, presets, panel, and banner:

_[tool: done]_

Done! Here's what changed:

**Section renamed:** "Solver weights" → **"Schedule priorities"**

**5 priorities rephrased** in plain language:
| Before | After |
|---|---|
| Night-shift fairness | **Fair night shifts** |
| Preference satisfaction | **Respect people's wishes** |
| Minimal changes | **Keep things stable** |
| Weekend rotation | **Share the weekends** |
| Sequence consistency | **Smooth shift changes** |

**UI simplified:**
- Removed technical `S1–S5` badge IDs
- Replaced the numeric score with a plain label: *Not used / Nice to have / Important / Very important*
- Slider now reads **"Not used → Must have"** instead of bare numbers
- Warning banner uses plain language instead of solver math
- Quick-set presets renamed: *Fairness-first → "Fair for all"*, *Stability-first → "Keep it steady"*

Head to **Sysadmin → Schedule priorities** in the sidebar to see it. (It may still say "Solver weights" in the Role Permissions table — let me know if you'd like that updated too.)

## User

sidebar is still Solver weights?

## Assistant

_[tool: grep]_

_[tool: str_replace_edit]_

_[tool: done]_

Fixed! The sidebar now shows **"Schedule priorities"** instead of "Solver weights".

