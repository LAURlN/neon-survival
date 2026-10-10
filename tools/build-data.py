"""Distil the extracted CSV tables into src/data/game-data.json.

Usage: python -I tools/build-data.py <dir with extracted TextAssets> <out.json>

Only numbers and short names are kept. Description prose is NOT copied: the game
generates its own text from the effect table (src/game/effects.ts).
"""
import sys, csv, io, json, re

src, out = sys.argv[1], sys.argv[2]

def load(name):
    text = open(f"{src}/{name}.txt", encoding="utf-8-sig").read()
    rows = [[c.strip() for c in r] for r in csv.reader(io.StringIO(text))]
    return [r for r in rows if any(r)]

def num(s):
    try:
        f = float(s)
        return int(f) if f == int(f) else f
    except ValueError:
        return 0

def effects(row, header, cols=None):
    """-> list (one entry per 효과ID_NN column) of [id, value] or None."""
    res = []
    for i, k in enumerate(header):
        if re.fullmatch(r"효과ID_\d+", k):
            eid, val = num(row[i]), num(row[i + 1])
            res.append(None if eid in (0, 1) or eid < 0 else [eid, val])
    return res

# ---- level curve -----------------------------------------------------------
all_stat = load("Dictionary_AllStat")
xp = [num(r[1]) for r in all_stat[1:] if r[0].isdigit()]  # xp[level] = mana needed

# ---- enemies ---------------------------------------------------------------
EN = {1: "Swarm (S)", 6: "Swarm (M)", 7: "Minion", 8: "Stinger", 11: "Swarm (L)", 12: "Drone",
      13: "Interceptor", 14: "Punisher", 16: "Hive", 17: "Dust", 18: "Rampage", 19: "Horizon",
      21: "Mine", 22: "Howling", 23: "Phantom", 24: "Trooper", 26: "Atlas", 27: "Overlord",
      28: "Goliath", 29: "Sentinel", 31: "Scarab", 32: "Corrupt", 33: "Seraphim", 34: "Oculus",
      41: "Citadel", 42: "Nemesis", 43: "Apostle", 45: "Watcher", 46: "Revenant"}
enemies = []
for r in load("Dictionary_UnitStat")[2:]:
    if not r[0].isdigit() or num(r[4]) == 0 or int(r[0]) not in EN:
        continue
    enemies.append({"id": int(r[0]), "name": EN[int(r[0])], "mana": num(r[2]), "atk": num(r[3]),
                    "hp": num(r[4]), "resist": num(r[5]), "speed": num(r[7]), "size": num(r[8]),
                    "traits": [num(x) for x in r[9:14] if num(x)]})

# ---- abilities -------------------------------------------------------------
ab = load("eng_Dictionary_Ability")
H = ab[0]
C = {k: i for i, k in enumerate(H)}
rows = {int(r[0]): r for r in ab[2:] if r[0].isdigit() and len(r) >= len(H)}

spells, passives, artifacts, traits_by_spell = [], [], [], {}
cur = None
for i in sorted(rows):
    r = rows[i]
    typ, name = r[C["유형"]], r[C["이름"]]
    if name in ("`", ""):
        continue
    eff = effects(r, H)
    if typ == "마법":
        spells.append({"id": i, "name": name, "maxLevel": num(r[C["최대레벨"]]),
                       "traitLevels": [x for x in (num(r[C["특성A레벨"]]), num(r[C["특성B레벨"]])) if x],
                       "levels": eff[1:7], "overLevel": [e for e in eff[7:9] if e]})
    elif typ == "패시브":
        passives.append({"id": i, "name": name, "maxLevel": num(r[C["최대레벨"]]),
                         "effects": [e for e in eff if e]})
    elif typ == "아티팩트":
        artifacts.append({"id": i, "name": name, "grade": num(r[C["요구레벨"]]),
                          "effects": [e for e in eff if e]})
    elif typ == "`" and i >= 361:
        cur = name
        traits_by_spell[cur] = []
    elif typ == "특성" and cur:
        traits_by_spell[cur].append({"id": i, "name": name, "effects": [e for e in eff if e]})

for s in spells:
    s["traits"] = traits_by_spell.get(s["name"], [])

data = {"xp": xp, "enemies": enemies, "spells": spells, "passives": passives, "artifacts": artifacts}
json.dump(data, open(out, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"xp levels {len(xp)}, enemies {len(enemies)}, spells {len(spells)}, passives {len(passives)}, "
      f"artifacts {len(artifacts)}, traits {sum(len(s['traits']) for s in spells)}")
