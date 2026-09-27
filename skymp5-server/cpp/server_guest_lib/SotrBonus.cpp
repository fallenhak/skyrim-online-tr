#include "SotrBonus.h"

#include "GetBaseActorValues.h"
#include "MpObjectReference.h"
#include <nlohmann/json.hpp>
#include <spdlog/spdlog.h>

namespace {
float GetNumber(const nlohmann::json& j, const char* key, float defaultValue)
{
  auto it = j.find(key);
  if (it == j.end() || !it->is_number()) {
    return defaultValue;
  }
  return it->get<float>();
}
}

float SotrBonus::GetAttackMult(const std::string& category) const
{
  auto it = attackMult.find(category);
  return it == attackMult.end() ? 1.f : it->second;
}

SotrBonus GetSotrBonus(const MpObjectReference& ref)
{
  SotrBonus res;

  const std::string& dump = ref.GetDynamicFields().GetValueDump("sotrBonus");
  if (dump == "null") {
    return res;
  }

  try {
    const auto j = nlohmann::json::parse(dump);
    if (!j.is_object()) {
      return res;
    }
    res.health = GetNumber(j, "h", 0.f);
    res.magicka = GetNumber(j, "m", 0.f);
    res.stamina = GetNumber(j, "s", 0.f);
    res.defenseMult = GetNumber(j, "def", 1.f);
    res.magicDefenseMult = GetNumber(j, "magicDef", 1.f);
    res.blockMult = GetNumber(j, "block", 1.f);
    res.powerAttackMult = GetNumber(j, "power", 1.f);
    res.sneakAttackMult = GetNumber(j, "sneak", 1.f);
    auto atk = j.find("atk");
    if (atk != j.end() && atk->is_object()) {
      for (auto it = atk->begin(); it != atk->end(); ++it) {
        if (it->is_number()) {
          res.attackMult[it.key()] = it->get<float>();
        }
      }
    }
  } catch (std::exception& e) {
    spdlog::warn("GetSotrBonus {:x} - {}", ref.GetFormId(), e.what());
  }

  return res;
}

void ApplySotrBonus(const MpObjectReference& ref, BaseActorValues& values)
{
  const SotrBonus bonus = GetSotrBonus(ref);
  values.health += bonus.health;
  values.magicka += bonus.magicka;
  values.stamina += bonus.stamina;
}
