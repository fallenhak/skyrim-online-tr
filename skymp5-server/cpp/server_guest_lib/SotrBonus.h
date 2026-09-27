#pragma once
#include <string>
#include <unordered_map>

class MpObjectReference;
struct BaseActorValues;

// Progression bonuses computed by the gamemode (levels, skills, perks) and
// stored in the "sotrBonus" custom property of player actors
struct SotrBonus
{
  float health = 0.f;
  float magicka = 0.f;
  float stamina = 0.f;

  float defenseMult = 1.f;      // incoming weapon damage
  float magicDefenseMult = 1.f; // incoming spell damage
  float blockMult = 1.f;        // incoming weapon damage when blocked
  float powerAttackMult = 1.f;
  float sneakAttackMult = 1.f;

  // Outgoing damage per category: oneHanded, twoHanded, archery, unarmed,
  // staff, bash, destruction
  std::unordered_map<std::string, float> attackMult;

  [[nodiscard]] float GetAttackMult(const std::string& category) const;
};

SotrBonus GetSotrBonus(const MpObjectReference& ref);

void ApplySotrBonus(const MpObjectReference& ref, BaseActorValues& values);
