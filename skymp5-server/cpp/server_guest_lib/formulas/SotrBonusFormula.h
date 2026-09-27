#pragma once
#include <memory>

#include "IDamageFormula.h"

// Applies progression bonuses (skills, perks) of the aggressor and the target
class SotrBonusFormula : public IDamageFormula
{
public:
  explicit SotrBonusFormula(std::unique_ptr<IDamageFormula> baseFormula_);

  [[nodiscard]] float CalculateDamage(const MpActor& aggressor,
                                      const MpActor& target,
                                      const HitData& hitData) const override;

  [[nodiscard]] float CalculateDamage(
    const MpActor& aggressor, const MpActor& target,
    const SpellCastData& spellCastData) const override;

private:
  std::unique_ptr<IDamageFormula> baseFormula;
};
