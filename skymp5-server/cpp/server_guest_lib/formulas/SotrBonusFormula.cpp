#include "SotrBonusFormula.h"

#include "MpActor.h"
#include "SotrBonus.h"
#include "WorldState.h"
#include "libespm/espm.h"

namespace {
const char* GetWeaponCategory(const MpActor& aggressor, const HitData& hitData)
{
  if (hitData.isBashAttack) {
    return "bash";
  }
  if (hitData.source == 0x1f4) {
    return "unarmed";
  }

  try {
    const auto weapData =
      espm::GetData<espm::WEAP>(hitData.source, aggressor.GetParent());
    if (!weapData.weapDNAM) {
      return "other";
    }
    switch (weapData.weapDNAM->animType) {
      case espm::WEAP::AnimType::OneHandSword:
      case espm::WEAP::AnimType::OneHandDagger:
      case espm::WEAP::AnimType::OneHandAxe:
      case espm::WEAP::AnimType::OneHandMace:
        return "oneHanded";
      case espm::WEAP::AnimType::TwoHandSword:
      case espm::WEAP::AnimType::TwoHandAxe:
        return "twoHanded";
      case espm::WEAP::AnimType::Bow:
      case espm::WEAP::AnimType::Crossbow:
        return "archery";
      case espm::WEAP::AnimType::Staff:
        return "staff";
      default:
        return "other";
    }
  } catch (std::exception&) {
    return "other";
  }
}
}

SotrBonusFormula::SotrBonusFormula(
  std::unique_ptr<IDamageFormula> baseFormula_)
  : baseFormula(std::move(baseFormula_))
{
}

float SotrBonusFormula::CalculateDamage(const MpActor& aggressor,
                                        const MpActor& target,
                                        const HitData& hitData) const
{
  float damage = baseFormula->CalculateDamage(aggressor, target, hitData);

  const SotrBonus aggressorBonus = GetSotrBonus(aggressor);
  damage *=
    aggressorBonus.GetAttackMult(GetWeaponCategory(aggressor, hitData));
  if (hitData.isPowerAttack) {
    damage *= aggressorBonus.powerAttackMult;
  }
  if (hitData.isSneakAttack) {
    damage *= aggressorBonus.sneakAttackMult;
  }

  const SotrBonus targetBonus = GetSotrBonus(target);
  damage *= targetBonus.defenseMult;
  if (hitData.isHitBlocked) {
    damage *= targetBonus.blockMult;
  }

  return damage;
}

float SotrBonusFormula::CalculateDamage(
  const MpActor& aggressor, const MpActor& target,
  const SpellCastData& spellCastData) const
{
  float damage =
    baseFormula->CalculateDamage(aggressor, target, spellCastData);
  damage *= GetSotrBonus(aggressor).GetAttackMult("destruction");
  damage *= GetSotrBonus(target).magicDefenseMult;
  return damage;
}
